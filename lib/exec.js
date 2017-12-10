
const jsdiff = require("diff");
const deepEql = require("deep-eql");
const generate = require('./generator');
const scan = require('./scan');
const dump = require('./dump');

function deepSort(n) {
	if (!n || Array.isArray(n) || typeof n !== 'object')
		return n;
	return Object.keys(n).sort().reduce((p, k) => { p[k] = deepSort(n[k]); return p; }, {});
}

module.exports = exec;
function exec(client, l, schema, format) {
	return scan.load(client, schema)
	.then(s => {
		let cmds = generate(s, l);
		return cmds.reduce((p, c) => p.then(() => client.query(c)), Promise.resolve())
		.then(() => scan.load(client, schema))
		.then(n => {
			let nn = { tables: n.tables, types: n.types, functions: {} };
			Object.keys(n.functions).forEach(k => nn.functions[k] = generate.normalizeFunction(n.functions[k]));
			let ln = { tables: l.tables, types: l.types, functions: {} };
			Object.keys(l.functions).forEach(k => ln.functions[k] = generate.normalizeFunction(l.functions[k]));
			if (deepEql(nn, ln))
				return cmds;
			let lt = dump(deepSort(ln), format);
			let nt = dump(deepSort(nn), format);
			let d = jsdiff.createTwoFilesPatch("target", "final", lt, nt);
			throw new Error("Database doesn't match after update:\n" + d);
		});
	});
}
