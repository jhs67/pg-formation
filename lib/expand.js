
const deepEql = require("deep-eql");

module.exports = expand;
expand.contract = contract;

function prefixName(prefix) {
	if (!prefix || prefix.length === 0) return "root";
	return prefix.join('.');
}

const Expanders = {
	object(value, schema, prefix) {
		// if this is an element block expand each key
		if (schema.elements) {
			let r = {};
			if (Array.isArray(value)) {
				value.forEach((v, i) => {
					let n = v && typeof v === 'object' && v.name;
					if (n) delete v.name;
					if (!n && schema.name)
						n = schema.name(v, schema, prefix);
					if (!n)
						throw new Error(`No name for object at ${prefixName(prefix)}[${i}]`);
					if (n in r)
						throw new Error(`Duplicate name ${n} at ${prefixName(prefix)}[${i}]`);
					r[n] = expand(v, schema.elements, prefix.concat([ n ]));
				});
				return r;
			}
			for (let k in value)
				r[k] = expand(value[k], schema.elements, prefix.concat([ k ]));
			return r;
		}

		// apply the map, if one exists
		let r = {};
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			if (schema.map)
				r[schema.map] = value;
			else
				throw new Error(`Expected object at ${prefixName(prefix)}`);
		}

		for (let k in schema.members) {
			// apply the defaults
			if (!(k in value) && 'default' in schema.members[k])
				r[k] = schema.members[k].default;
			// check for missing required values
			else if (!(k in value) && schema.members[k].required)
				throw new Error(`Missing required value '${k}' at ${prefixName(prefix)}`);
		}

		// check each key in turn
		for (let k in value) {
			// check for extra values
			if (!(k in schema.members))
				throw new Error(`Unknown key value '${k}' in ${prefixName(prefix)}`);

			// check for conflicting values
			let m = schema.members[k];
			let conflict = m.conflicts && m.conflicts.reduce(
				(p, c) => c in value ? c : p, null);
			if (conflict)
				throw new Error (`Key ${k} conflicts with ${conflict} at ${prefixName(prefix)}`);

			// expand the value
			r[k] = expand(value[k], m, prefix.concat([ k ]));
		}

		return r;
	},

	string(value, schema, prefix) {
		if (typeof value !== 'string')
			throw new Error(`Expected string at ${prefixName(prefix)}`);
		if (schema.choices && schema.choices.indexOf(value) === -1)
			throw new Error(`Expected [schema.choices.join(', ')] at ${prefixName(prefix)}, got ${typeof value}`);
		return value;
	},

	boolean(value, schema, prefix) {
		if (typeof value !== 'boolean')
			throw new Error(`Expected boolean at ${prefixName(prefix)}, got ${typeof value}`);
		return value;
	},

	array(value, schema, prefix) {
		if (!Array.isArray(value))
			value = [ value ];
		return value.map((v, i) => expand(v, schema.elements, prefix.concat([ i ])));
	},

	any(value) {
		return value;
	},
};

function expand(value, schema, prefix = []) {
	// apply any user expansion first
	if (schema.expand)
		value = schema.expand(value, schema, prefix);

	let e = Expanders[schema.type];
	if (!e)
		throw new Error(`Unknown schema type '${schema.type}' expanding ${prefixName(prefix)}`);

	return e(value, schema, prefix);
}

const Contractors = {
	object(value, schema, prefix) {
		value = Expanders.object(value, schema, prefix);

		if (typeof value !== 'object' || Array.isArray(value))
			throw new Error(`Expected object at ${prefixName(prefix)}`);

		if (schema.elements) {
			for (let k in value)
				value[k] = contract(value[k], schema.elements, prefix.concat([ k ]));
			return value;
		}

		// contract each key in turn
		for (let k in value) {
			value[k] = contract(value[k], schema.members[k], prefix.concat([ k ]));
		}

		// remove default values
		for (let k in schema.members) {
			if ((k in value) && ('default' in schema.members[k]) && deepEql(value[k], schema.members[k].default))
				delete value[k];
		}

		// try to reverse a map
		if (schema.map) {
			let keys = Object.keys(value);
			if (keys.length === 1) {
				let k = keys[0];
				if (schema.map === k)
					return value[k];
			}
		}

		return value;
	},

	string(value, schema, prefix) {
		return Expanders.string(value, schema, prefix);
	},

	boolean(value, schema, prefix) {
		return Expanders.boolean(value, schema, prefix);
	},

	array(value, schema, prefix) {
		value = Expanders.array(value, schema, prefix);
		if (value.length === 1) {
			value = contract(value[0], schema.elements, prefix.concat([ 0 ]));
			return Array.isArray(value) ? [ value ] : value;
		}
		return value.map((v, i) => contract(v, schema.elements, prefix.concat([ i ])));
	},

	any(value) {
		return value;
	},
};

function contract(value, schema, prefix = []) {
	// apply any user expansion first
	if (schema.expand)
		value = schema.expand(value, schema, prefix);

	let c = Contractors[schema.type];
	if (!c)
		throw new Error(`Unknown schema type '${schema.type}' contracting ${prefixName(prefix)}`);
	value = c(value, schema, prefix);

	if (schema.contract)
		value = schema.contract(value, schema, prefix);

	return value;
}
