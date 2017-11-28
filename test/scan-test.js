/* eslint-env node, mocha */

const expect = require("chai").expect;
const setup = require("./lib/setup");
const scan = require("../lib/scan");

const TestBody = `
-- one line comments inside should be preserved
BEGIN
END
`;

describe("it scans a test database", function() {
	before(function() {
		return setup.cleanSlate()
		.then(() => setup.client(client => {
			return client.query(`CREATE TABLE test_table (id serial primary key, "Column1" integer, COLUMN2 text);`)
			.then(() => client.query(`CREATE INDEX test_table_column2_index ON test_table ( column2 )`))
			.then(() => client.query(`CREATE TYPE test_type AS ENUM ( 'enum1', 'enum2', 'enum3' )`))
			.then(() => client.query(`CREATE FUNCTION test_function(arg1 test_type, arg2 integer default 0)
				RETURNS VOID AS $$${TestBody}$$ LANGUAGE plpgsql`));
		}));
	});

	after(function() {
		return setup.cleanup();
	});

	it("reads the test database", function() {
		return setup.client(client => scan.load(client, "public"))
		.then(result => {
			expect(result.tables).to.deep.equal({ "test_table": {
				columns: {
					id: { type: "serial", primaryKey: true, notNull: true },
					Column1: { type: "integer" },
					column2: { type: "text" }
				},
				indices: {
					test_table_column2_index: {
						columns: [ "column2" ],
						method: "btree",
						unique: false
					}
				}
			}});
			expect(result.types).to.deep.equal({
				test_type: { values: ['enum1', 'enum2', 'enum3' ]}
			});
		});
	});
});




