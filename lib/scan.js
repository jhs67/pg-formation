
const config = require('./config');
const pgquery = require("pg-query-emscripten");
const deparser = require("./deparser");


const indexQuery = `
SELECT
	c.relname AS name,
	i.indisunique AS unique,
	i.indisprimary AS primarykey,
	a.amname AS method,
	i.indkey AS columns,
	pg_get_expr(i.indexprs, t.oid) AS exprs
FROM pg_class c
	JOIN pg_index i ON i.indexrelid = c.oid
	JOIN pg_am a ON c.relam = a.oid
	JOIN pg_class t ON i.indrelid = t.oid
    LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = $1
    AND t.relname = $2
;`;

function processIndices(res, table, rows) {
	// map the columns to names
	res.rows.forEach(r => {
		let exprs, ei = 0;
		if (r.exprs) {
			// extract expressions for non-column constrants
			const p = pgquery.parse(`SELECT ${r.exprs}`);
			const tl = p.parse_tree[0].RawStmt.stmt.SelectStmt.targetList;
			exprs = tl.map((e) => deparser.deparse([e.ResTarget.val]));
		}
		r.columns = r.columns.split(' ').map(v => {
			let k = parseInt(v);
			if (k === 0) return exprs[ei++];
			return rows.reduce((p, r) => r.attnum === k ? r.name : p, null);
		});
	});

	// filter out automatic indices for column constraints
	let i = {};
	res.rows.filter(r => {
		// check for unique or primary key indices
		if (!r.unique && !r.primarykey)
			return true;
		// only single column indices
		if (r.columns.length !== 1)
			return true;
		// make sure the name matches the default
		let cannon = r.primarykey ? `${table}_pkey` : `${table}_${r.columns[0]}_key`;
		if (r.name !== cannon)
			return true;
		// make sure this column really matches the index
		let c = rows.reduce((p, c) => c.name === r.columns[0] ? c : p, null);
		return c.primarykey !== r.primarykey || c.unique !== r.uniquekey;
	}).forEach(r => {
		i[r.name] = { unique: r.unique, method: r.method, columns: r.columns };
	});

	return i;
}


function loadIndices(client, schema, table, rows) {
	return client.query(indexQuery, [ schema, table ])
	.then(res => processIndices(res, table, rows));
}

const tableQuery = `
SELECT
    f.attnum AS number,
    f.attname AS name,
    f.attnum,
    f.attnotnull AS notnull,
    pg_catalog.format_type(f.atttypid,f.atttypmod) AS type,
    CASE
        WHEN p.contype = 'p' THEN TRUE
        ELSE FALSE
    END AS primarykey,
    CASE
        WHEN p.contype = 'u' THEN TRUE
        ELSE FALSE
    END AS uniquekey,
    CASE
        WHEN p.contype = 'f' THEN g.relname
    END AS foreignkey,
    CASE
        WHEN p.contype = 'f' THEN p.confkey
    END AS foreignkey_fieldnum,
    CASE
        WHEN p.contype = 'f' THEN g.relname
    END AS foreignkey,
    CASE
        WHEN p.contype = 'f' THEN p.conkey
    END AS foreignkey_connnum,
    CASE
        WHEN f.atthasdef = 't' THEN pg_get_expr(d.adbin, d.adrelid)
    END AS default
FROM pg_attribute f
    JOIN pg_class c ON c.oid = f.attrelid
    JOIN pg_type t ON t.oid = f.atttypid
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = f.attnum
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_constraint p ON p.conrelid = c.oid AND f.attnum = ANY (p.conkey)
    LEFT JOIN pg_class AS g ON p.confrelid = g.oid
WHERE c.relkind = 'r'::char
    AND n.nspname = $1
    AND c.relname = $2
    AND f.attnum > 0 ORDER BY number
;`;

function col2col(table, r) {
	const c = { type: r.type, };
	if (r.default) {
		if (r.default === `nextval('${table}_${r.name}_seq'::regclass)`) {
			if (r.type === "integer")
				c.type = "serial";
			else if (r.type === "bigint")
				c.type === "bigserial";
			else if (r.type === "smallint")
				c.type === "smallserial";
			else
				c.default = r.default;
		}
		else {
			c.default = r.default;
		}
	}
	if (r.uniquekey)
		c.unique = true;
	if (r.primarykey)
		c.primarykey = true;
	if (r.notnull)
		c.notnull = true;
	if (r.foreignkey)
		c.references = r.foreignkey;
	return c;
}

function processTable(client, schema, table, res) {
	const columns = {};
	res.rows.forEach(r => { columns[r.name] = col2col(table, r); });

	return loadIndices(client, schema, table, res.rows)
	.then(indices => ({ columns, indices }) );
}

function loadTable(client, schema, table) {
	return client.query(tableQuery, [ schema, table ])
	.then(res => processTable(client, schema, table, res));
}

function processTables(client, schema, res) {
	const tables = {};
	return res.rows.reduce((p, r) => p.then(() =>
		loadTable(client, schema, r.table_name).then(t => tables[r.table_name] = t)),
		Promise.resolve())
	.then(() => tables);
}

function loadTables(client, schema) {
	return client.query(`SELECT table_name FROM information_schema.tables
		WHERE table_schema = $1`, [ schema ])
	.then(res => processTables(client, schema, res));
}



const enumQuery = `
SELECT
	e.enumlabel AS label
FROM pg_enum e
WHERE e.enumtypid = $1
ORDER BY e.enumsortorder
;`;

function loadEnum(client, oid) {
	return client.query(enumQuery, [ oid ])
	.then(res => ({ values: res.rows.map(v => v.label) }));
}

const typeQuery = `
SELECT
	t.oid AS oid,
	t.typname AS name
FROM pg_type t
	LEFT JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typtype = 'e'::char AND
	n.nspname = $1
;`;

function processTypes(client, res) {
	const enums = {};
	return res.rows.reduce((p, r) => p.then(() =>
		loadEnum(client, r.oid).then(e => enums[r.name] = e)), Promise.resolve())
	.then(() => enums);
}

function loadTypes(client, schema) {
	return client.query(typeQuery, [ schema ])
	.then(res => processTypes(client, res));
}


const functionsQuery = `
SELECT
	quote_ident(p.proname) AS name,
	pg_get_function_arguments(p.oid) AS args,
	quote_ident(l.lanname) AS language,
	p.prosrc AS body,
	pg_get_function_result(p.oid) AS result
FROM pg_proc p
	INNER JOIN pg_namespace n ON p.pronamespace = n.oid
	INNER JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = $1
	AND l.lanname = 'plpgsql'
;`;

function processFunctions(client, res) {
	const functions = {};
	res.rows.forEach(r => {
		functions[r.name] =
`CREATE FUNCTION ${r.name}(${r.args})
RETURNS ${r.result}
AS $$${r.body}$$
LANGUAGE ${r.language};
`;
	});
	return functions;
}

function loadFunctions(client, schema) {
	return client.query(functionsQuery, [ schema ])
	.then(res => processFunctions(client, res));
}



exports.load = load;
function load(client, schema) {
	return loadTables(client, schema)
	.then(tables => loadTypes(client, schema)
		.then(types => loadFunctions(client, schema)
			.then(functions => (config.expand({ tables, types, functions })))));
}
