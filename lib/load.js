
const glob = require('glob');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const mime = require('mime-types');

// promisify glob
function pglob(s, o) {
	return new Promise((a, r) => glob(s, o, (e, f) => e ? r(e) : a(f)) );
}

// glob a vector
function vglob(s) {
	if (Array.isArray(s))
		return Promise.all(s.map(s => pglob(s))).then(a => [].concat(...a));
	return pglob(s);
}

// load a schema definition file
function loadConfigFile(schema, override) {
	let type = mime.lookup(schema);
	if (override === 'json')
		type = 'application/json';
	if (override === 'js')
		type = 'application/javascript';
	if (override === 'yaml')
		type = 'text/yaml';

	if (type === "application/json" || override === 'js') {
		return fs.readJson(schema);
	}

	if (type === "text/yaml") {
		return fs.readFile(schema, "utf-8")
		.then(y => yaml.load(y));
	}

	if (type === "application/javascript") {
		return fs.readFile(schema, "utf8")
		.then(y => {
			let m = new module.constructor();
			m._compile(y, schema);
			return m.exports;
		});
	}

	throw new Error("Unrecognized config file format: " + schema);
}

function normalizeArrays(v, f) {
	if (!Array.isArray(v))
		return v;
	let r = {};
	v.forEach(v => {
		let n = v && typeof v === 'object' && v.name;
		if (n)
			delete v.name;
		if (!n && f)
			n = f(v);
		if (!n)
			throw new Error("object needs a name expanding array");
		if (n in r)
			throw new Error(`duplicate name %{n} resolving arrays`);
		r[n] = v;
	});
	return r;
}

function normalizeColumn(name, def) {
	if (typeof def === 'string')
		def = { type: def };
	if (!('unique' in def))
		def.unique = false;
	if (!('primaryKey' in def))
		def.primaryKey = false;
	return def;
}

function normalizeIndex(name, def) {
	if (!('unique' in def))
		def.unique = false;
	if (!('method' in def))
		def.method = 'btree';
	return def;
}

function normalizeTable(name, def) {
	def.columns = normalizeArrays(def.columns);
	for (let k in def.columns)
		def.columns[k] = normalizeColumn(k, def.columns[k]);
	def.indices = normalizeArrays(def.indices, v =>
		[ name ].concat(v.columns).concat([ 'index' ]).join('_'));
	for (let k in def.indices)
		def.indices[k] = normalizeIndex(k, def.indices[k]);
	return def;
}

function normalizeType(name, def) {
	return def;
}

function normalizeSchema(s) {
	s.tables = normalizeArrays(s.tables || {});
	for (let k in s.tables)
		s.tables[k] = normalizeTable(k, s.tables[k]);

	s.types = normalizeArrays(s.types || {});
	for (let k in s.types)
		s.types[k] = normalizeType(k, s.types[k]);

	return s;
}

function loadSchema(schema, override) {
	return loadConfigFile(schema, override).then(v => normalizeSchema(v));
}

// load and parse a function
function loadFunction(f) {
	return fs.readFile(f, 'utf8')
	.then(b => ({ file: f, body: b, def: { name: b.match(/CREATE\s*(?:|OR\s*REPLACE\s*)FUNCTION\s*([^\s()]*)/)[1] } }))
	.catch(err => { err.message = f + ": " + err.message; throw err; });
}

// merge to objects and error on duplicates
function kmerge(l, r, t) {
	for (let k in r) {
		if (k in l) throw new Error(`duplicate ${t} definition: ${k}`);
		l[k] = r[k];
	}
}

module.exports = loadConfig;
function loadConfig(schemas, functions, override) {

	return Promise.all([
		vglob(schemas).then(s => Promise.all(s.map(s => loadSchema(s, override)))),
		vglob(functions).then(f => Promise.all(f.map(f => loadFunction(f)))),
	])
	.then(([sdefs, fdefs]) => {
		// merge all the definitions
		const schema = sdefs.reduce((p, v) => {
			kmerge(p.functions, v.functions || {}, "function");
			kmerge(p.tables, v.tables || {}, "table");
			kmerge(p.types, v.types || {}, "type");
			return p;
		}, { tables: {}, types: {}, functions: {} });

		// merge the loaded functions into the schema
		fdefs.forEach(d => {
			const n = d.def.name;
			if (n in schema.functions)
				throw new Error("duplicate funciton definition:", n);
			schema.functions[n] = d.body;
		});

		return schema;
	});

}
