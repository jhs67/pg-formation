
const deepEql = require("deep-eql");
const expand = require('./expand');
const contract = expand.contract;


const TypeMap = {
	"bigint": "bigint",
	"int8": "bigint",
	"bigserial": "bigserial",
	"serial8": "bigserial",
	"boolean": "boolean",
	"bool": "boolean",
	"box": "box",
	"bytea": "bytea",
	"cidr": "cidr",
	"circle": "circle",
	"double precision": "double precision",
	"float8": "double precision",
	"inet": "inet",
	"integer": "integer",
	"interval": "interval",
	"int": "integer",
	"int4": "integer",
	"json": "json",
	"jsonb": "jsonb",
	"line": "line",
	"lseg": "lseg",
	"macaddr": "macaddr",
	"money": "money",
	"numeric": "numeric",
	"path": "path",
	"pg_lsn": "pg_lsn",
	"point": "point",
	"polygon": "polygon",
	"real": "real",
	"float4": "real",
	"smallint": "smallint",
	"int2": "smallint",
	"smallserial": "smallserial",
	"serial2": "smallserial",
	"serial": "serial",
	"serial4": "serial",
	"text": "text",
	"time without time zone": "time without time zone",
	"time": "time without time zone",
	"time with time zone": "time with time zone",
	"timetz": "time with time zone",
	"timestamp without time zone": "timestamp without time zone",
	"timestamp": "timestamp without time zone",
	"timestamp with time zone": "timestamp with time zone",
	"timestamptz": "timestamp with time zone",
	"tsquery": "tsquery",
	"tsvector": "tsvector",
	"txid_snapshot": "txid_snapshot",
	"uuid": "uuid",
	"xml": "xml",
	"void": "void",
};

const TypePatterns = [
	{ pattern: /bit ?\[ ?(-?[0-9]+) ?]/, map: m => `bit[${m[1]}]` },
	{ pattern: /bit varying ?\[ ?([0-9]*) ?]/, map: m => `bit varying[${m[1]}]` },
	{ pattern: /character ?\[ ?([0-9]*) ?]/, map: m => `character[${m[1]}]` },
	{ pattern: /character varying ?\[ ?([0-9]*) ?]/, map: m => `character varying[${m[1]}]` },
	{ pattern: /interval (year|month|day|hour|minute|second|year to month|day to hour|day to minute|day to second|hour to minute|hour to second|minute to second)(| [0-9]|10)/,
		map: m => `interval ${m[1]}${m[2]}` },
	{ pattern: /numeric ?\( ?([0-9]+)(?:|, ?([0-9]+)) ?\)/, map: m => `numeric(${m[1]}${m[2] ? ', ' + m[2] : ''}` },
	{ pattern: /time ([0-9]+)(| without time zone| with time zone)/, map: m => m[0] },
	{ pattern: /timestamp ([0-9]+)(| without time zone| with time zone)/, map: m => m[0] },
];

const TypeSchema = {
	type: "string",

	required: true,

	expand(value) {
		if (typeof value !== 'string')
			return value;

		// normalize the whitespace and lower case
		let n = value.toLowerCase().replace(/\s+/g, ' ').split(' ').filter(v => v).join(' ');

		// check if it matches a know type
		if (n in TypeMap)
			return TypeMap[n];

		// check for more complicated patterns
		for (let k of TypePatterns) {
			let m = value.match(k.pattern);
			if (m) return k.map(m);
		}

		// maybe a user type, just return it
		return value;
	}
};

const ColumnDefaultSchema = {
	type: "any",

	expand(value, schema, prefix) {
		if (typeof value === 'string')
			return value;
		if (value == null)
			return null;
		if (value === true || value === false)
			return value.toString();
		if (Array.isArray(value))
			return value;
		throw new Error(`expected string or null for default value at ${prefix}`);
	}
};

exports.schema = {
	type: "object",

	members: {
		tables: {
			type: "object",
			default: {},

			elements: {
				type: "object",
				required: true,

				members: {
					columns: {
						type: "object",

						elements: {
							type: "object",

							map: 'type',

							members: {
								type: TypeSchema,
								primarykey: { type: "boolean", default: false },
								unique: { type: "boolean", default: false },
								notnull: { type: "boolean", default: false },
								default: ColumnDefaultSchema,
								references: { type: "string" },
							},

							expand(v, schema, prefix) {
								if (typeof v === 'string')
									v = { type: v };
								if (typeof v.type === 'string' && v.type.toLowerCase() === "id") {
									v.type = "serial";
									v.primarykey = true;
								}
								if (v && typeof v === 'object' && v.primarykey) {
									if (!('unique' in v))
										v.unique = true;
									if (!('notnull' in v))
										v.notnull = true;
									if (!v.unique)
										throw new Error(`primary key columns can't have 'unique = false at ${prefix}`);
									if (!v.notnull)
										throw new Error(`primary key columns can't have 'notnull = false at ${prefix}`);
								}
								return v;
							},

							contract(v) {
								if (v.primarykey) {
									delete v.unique;
									delete v.notnull;
									if (deepEql(v, { type: 'serial', primarykey: true }))
										return "id";
								}
								return v;
							}
						},
					},

					indices: {
						type: "object",
						default: {},

						name(value, schema, prefix) {
							let k = Array.isArray(value.columns) ? value.columns.join('_') : value.columns;
							return `${prefix[1]}_${k}_index`;
						},

						elements: {
							type: "object",

							members: {
								unique: { type: "boolean", default: false },
								method: { type: "string", default: "btree" },
								columns: { type: "array", elements: { type: "string" }, required: true }
							}
						},
					},
				}
			},
		},

		types: {
			type: "object",
			default: {},

			elements: {
				type: "object",

				members: {
					values: { type: "array", elements: { type: "string" }, required: true },
				},
			},
		},

		functions: {
			type: "object",
			default: {},

			elements: {
				type: "string",
				required: true,
			},
		}
	},
};

exports.expand = function(value) {
	return expand(value, exports.schema);
};

exports.contract = function(value) {
	return contract(value, exports.schema);
};
