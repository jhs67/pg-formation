/* eslint-env node, mocha */

const expect = require("chai").expect;
const load = require("../lib/load");
const fs = require('fs-extra');

const ExpectedConfig = {
	tables: {
		js: {
			columns: {
				id: { type: "serial", primarykey: true, unique: true, notnull: true },
				another: { type: "text", unique: true, primarykey: false, notnull: false },
				bold: { type: "text", unique: false, primarykey: false, notnull: false }
			},
			indices: {
				explicit_name: { columns: [ "another", "bold" ], unique: true, method: "btree" }
			}
		},
		json: {
			columns: {
				hello: { type: "text", default: "goodbye", unique: false, primarykey: false, notnull: false },
				another: { type: "integer", unique: false, primarykey: false, notnull: false }
			},
			indices: {}
		},
		yaml: {
			columns: {
				id: { type: "serial", unique: true, primarykey: true, notnull: true },
				text: { type: "timestamp with time zone", unique: false, primarykey: false, notnull: false },
				time: { type: "integer", unique: false, primarykey: false, notnull: false }
			},
			indices: {
				yaml_text_index: { columns: [ "text" ], unique: false, method: "btree" },
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
