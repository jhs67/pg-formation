
const yaml = require('js-yaml');
const indt = '  ';

function _dumpKey(k) {
	return k.match(/[a-zA-Z_$][0-9a-zA-Z_$]*/) ? k : JSON.stringify(k);
}

function _jsDump(o, i) {
	if (Array.isArray(o)) {
		return "[\n" + o.map(v => i + indt + _jsDump(v, i + indt)).join(',\n') + "\n" + i + "]";
	}

	if (o != null && typeof o === 'object') {
		let k = Object.keys(o);
		return k.length === 0 ? "{}" : "{\n" +
			k.map(k => i + indt + _dumpKey(k) + ": " + _jsDump(o[k], i + indt)).join(',\n') + "\n" + i + "}";
	}

	return JSON.stringify(o);
}

function jsDump(o) {
	return "module.exports = " + _jsDump(o, '') + ";";
}

module.exports = dump;
function dump(o, format) {
	if (format === 'json')
		return JSON.stringify(o, null, 2);
	if (format === 'yaml')
		return yaml.dump(o);
	if (format !== 'js')
		throw new Error(`Invalid dump format: ${format}. Expected: js, json, or yaml`);
	return jsDump(o);
}
