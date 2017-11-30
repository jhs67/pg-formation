/* eslint-env node, mocha */

const expect = require("chai").expect;
const load = require("../lib/load");
const fs = require('fs-extra');

const ExpectedConfig = {
	tables: {
		js: {
			columns: {
				id: { type: "serial", primaryKey: true, unique: false },
				another: { type: "text", unique: true, primaryKey: false },
				bold: { type: "text", unique: false, primaryKey: false }
			},
			indices: {
				explicit_name: { columns: [ "another", "bold" ], unique: true, method: "btree" }
			}
		},
		json: {
			columns: {
				hello: { type: "text", default: "goodbye", unique: false, primaryKey: false },
				another: { type: "integer", unique: false, primaryKey: false }
			},
			indices: undefined
		},
		yaml: {
			columns: {
				id: { type: "id", unique: false, primaryKey: false },
				name: { type: "text", unique: false, primaryKey: false },
				type: { type: "timestamptz", unique: false, primaryKey: false }
			},
			indices: {
				yaml_text_index: { columns: "text", unique: false, method: "btree" },
				yaml_id_time_index: { columns: [ "id", "time" ], unique: false, method: "btree" }
			}
		}
	},
	types: {
		foofara: {
			values: [ "a", "b", "c" ]
		}
	},
};

describe("Loads the configuration file", function() {
	it("loads the test configuration", function() {
		return load("test/conf/schema.@(js|json|yaml)", "test/conf/plpgsql/**/*.sql")
		.then(conf => {
			const f = conf.functions;
			delete conf.functions;
			expect(conf).to.deep.equal(ExpectedConfig);
			return Promise.all(Object.keys(f).map(n => {
				return fs.readFile(`test/conf/plpgsql/${n}.sql`, 'utf8')
				.then(b => expect(f[n]).to.deep.equal(b));
			}));
		});
	});
});
