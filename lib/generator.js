
const objdiff = require("./objdiff");
const format = require('pg-format');
const jsdiff = require("diff");
const deparser = require("./deparser");
const pgquery = require("pg-query-emscripten");
const deepEql = require("deep-eql");

function createIndex(cmds, table, name, def) {
	cmds.push(format("CREATE%s INDEX %I ON %I USING %s (%s)",
		def.unique ? " UNIQUE" : "", name, table,
		def.method, def.columns.map(c => format("%I", c)).join(", ")));
}

function dropIndex(cmds, name) {
	cmds.push(format("DROP INDEX %I", name));
}

function columnDef(name, def) {
	let r = format("%I %s", name, def.type);

	if (def.primarykey) {
		r += " PRIMARY KEY";
	}
	else {
		if (def.unique)
			r += " UNIQUE";
		if (def.notnull)
			r += " NOT NULL";
	}

	if ('default' in def) {
		r += format(" DEFAULT %s", def.default);
	}

	if (def.references)
		r += format(" REFERENCES %I", def.references);

	return r;
}

function createTable(cmds, name, def) {
	cmds.push(format("CREATE TABLE %I (\n  %s)", name,
		Object.keys(def.columns).map(n => columnDef(n, def.columns[n])).join(",\n  ")));

	for (let i in def.indices)
		createIndex(cmds, name, i, def.indices[i]);
}

function alterTable(cmds, name, from, to) {
	const columndiff = objdiff(from.columns, to.columns);

	let p = format("ALTER TABLE %I ", name);
	for (let k of columndiff.add) {
		cmds.push(p + format("ADD " + columnDef(k, to.columns[k])));
	}

	for (let k of columndiff.change) {

		let f = from.columns[k], t = to.columns[k];
		if (f.type !== t.type) {
			cmds.push(p + "ALTER %I TYPE %s", k, t.type);
		}

		if (f.primarykey && !t.primarykey) {
			cmds.push(p + format("DROP CONSTRAINT %I", `${name}_pkey`));
			if (t.unique)
				cmds.push(p + format("ADD UNIQUE (%I)", k));
			if (!t.notnull)
				cmds.push(p + format("ALTER %I DROP NOT NULL", k));
		}
		else if (t.primarykey && !f.primarykey) {
			if (f.unique)
				cmds.push(p + format("DROP CONSTRAINT %I", `${name}_${k}_key`));
			if (f.notnull)
				cmds.push(p + format("ALTER %I DROP NOT NULL", k));
			cmds.push(p + format("ADD PRIMARY KEY (%I)", k));
		}
		else if (!t.primarykey) {
			if (f.unique && !t.unique)
				cmds.push(p + format("DROP CONSTRAINT %I", `${name}_${k}_key`));
			if (t.unique && !f.unique)
				cmds.push(p + format("ADD UNIQUE (%I)", k));

			if (f.notnull && !t.notnull)
				cmds.push(p + format("ALTER %I DROP NOT NULL", k));
			else if (!f.notnull && t.notnull)
				cmds.push(p + format("ALTER %I ADD NOT NULL", k));
		}

		if (f.references && f.references != t.references)
			cmds.push(p + format("DROP CONSTRAINT %I", `${name}_${f.references}_key`));
		if (t.references && t.references != f.references)
			cmds.push(p + format("ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES %I",
				`${name}_${t.references}_key`, t.references, t.references));

		if (('default' in f) && !('default' in t))
			cmds.push(p + format("ALTER %I DROP DEFAULT", k));
		else if (('default' in t) && f.default !== t.default)
			cmds.push(p + format("ALTER %I SET DEFAULT %s", k, t.default));

	}

	for (let k of columndiff.remove) {
		cmds.push(p + format("DROP " + format("%I", k)));
	}

	const indicesdiff = objdiff(from.indices, to.indices);
	for (let k of indicesdiff.add) {
		createIndex(cmds, name, k, to.indices[k]);
	}

	for (let k of indicesdiff.change) {
		dropIndex(cmds, k);
		createIndex(cmds, name, k, to.indices[k]);
	}

	for (let k of indicesdiff.remove) {
		dropIndex(cmds, k);
	}
}

function dropTable(cmds, name) {
	cmds.push(format("DROP TABLE %I", name));
}

function createType(cmds, name, def) {
	cmds.push(format("CREATE TYPE %I AS ENUM (%s)", name,
		def.values.map(c => format("%L", c)).join(", ")));
}

function alterType(cmds, name, from, to) {
	let i = 0;
	let bad = [];
	let active = [...from.values];
	jsdiff.diffArrays(from.values, to.values).forEach(d => {
		if (d.removed) {
			bad = bad.concat(d.value);
			i += d.count;
		}
		else if (d.added) {
			d.value.forEach(v => {
				cmds.push(format("ALTER TYPE %I ADD VALUE %L%s", name, v,
					active.length === 0 ? "" :
					i === 0 ? format(" BEFORE %L", active[0]) :
					format(" AFTER %L", active[i - 1])));
				active.splice(i, 0, v);
				i += 1;
			});
		}
		else {
			i += d.count;
		}
	});
	if (bad.length !== 0)
		process.stdout.write(`Warning: can't remove values ${bad.join(", ")} from enum ${name}
`);
}

function parseFunction(f) {
	let r = pgquery.parse(f).parse_tree;
	delete r[0].CreateFunctionStmt.replace;
	return r;
}

generate.normalizeFunction = normalizeFunction;
function normalizeFunction(f) {
	return deparser.deparse(parseFunction(f));
}

function dropType(cmds, name) {
	cmds.push(format("DROP TYPE %I", name));
}

function createFunction(cmds, name, def) {
	cmds.push(normalizeFunction(def));
}

function alterFunction(cmds, name, from, to) {
	dropFunction(cmds, name, from);
	createFunction(cmds, name, to);
}

function dropFunction(cmds, name, def) {
	let p = pgquery.parse(def);
	let c = p.parse_tree[0].CreateFunctionStmt;
	let d = [ { DropStmt: {
		objects: [ c.funcname ],
		arguments: [ c.parameters.filter(v => v.FunctionParameter.mode === 105)
			.map(v => v.FunctionParameter.argType) ],
		removeType: 18,
	}}];
	let f = deparser.deparse(d);
	cmds.push(f);
}

function stripLocation(obj) {
	if (Array.isArray(obj)) {
		return obj.map(v => stripLocation(v));
	}
	else if (obj && typeof obj === 'object') {
		let r = {};
		Object.keys(obj).filter(k => k !== "location").forEach(k => r[k] = stripLocation(obj[k]));
		return r;
	}
	else {
		return obj;
	}
}

function funcdiff(from, to) {
	let fparse = stripLocation(parseFunction(from));
	let tparse = stripLocation(parseFunction(to));
	return deepEql(fparse, tparse);
}

module.exports = generate;
function generate(from, to) {
	const cmds = [];
	const typediff = objdiff(from.types, to.types);

	for (let k of typediff.add) {
		createType(cmds, k, to.types[k]);
	}

	for (let k of typediff.change) {
		alterType(cmds, k, from.types[k], to.types[k]);
	}

	for (let k of typediff.remove) {
		dropType(cmds, k);
	}

	const tablediff = objdiff(from.tables, to.tables);

	for (let k of tablediff.add) {
		createTable(cmds, k, to.tables[k]);
	}

	for (let k of tablediff.change) {
		alterTable(cmds, k, from.tables[k], to.tables[k]);
	}

	for (let k of tablediff.remove) {
		dropTable(cmds, k);
	}

	const functiondiff = objdiff(from.functions, to.functions, funcdiff);

	for (let k of functiondiff.add) {
		createFunction(cmds, k, to.functions[k]);
	}

	for (let k of functiondiff.change) {
		alterFunction(cmds, k, from.functions[k], to.functions[k]);
	}

	for (let k of functiondiff.remove) {
		dropFunction(cmds, k, from.functions[k]);
	}

	return cmds;
}
