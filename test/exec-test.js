/* eslint-env node, mocha */

const chai = require("chai");
chai.use(require("chai-as-promised"));
const expect = chai.expect;
const config = require("../lib/config");
const setup = require("./lib/setup");
const exec = require("../lib/exec");

describe("Executes updates", function() {
	before(function() {
		return setup.cleanSlate();
	});

	after(function() {
		return setup.cleanup();
	});

	let conf = {
		tables: {
			t1: {
				columns: {
					c1: "id",
					c2: "text",
				}
			}
		}
	};

	it("bootstraps the database", function() {
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds a column to a table", function() {
		conf.tables.t1.columns.c3 = { type: "text", notnull: true };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("removes the not null", function() {
		delete conf.tables.t1.columns.c3.notnull;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("makes a column unique", function() {
		conf.tables.t1.columns.c3.unique = true;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("drops a column", function() {
		delete conf.tables.t1.columns.c2;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds an index", function() {
		conf.tables.t1.indices = [ { columns: ["c1", "c3"] } ];
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("drops an index", function() {
		conf.tables.t1.indices = [];
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds a type", function() {
		conf.types = { type1: { values: ["a", "b", "c"] } };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds enum columns to a table", function() {
		conf.tables.t1.columns.ce = { type: "type1" };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("can't drop type used by column", function() {
		delete conf.types.type1;
		return expect(setup.transaction(client => exec(client, config.expand(conf),
			"public", "yaml"))).to.eventually.be.rejected;
	});

	it("drops enum type and column", function() {
		delete conf.tables.t1.columns.ce;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds a function", function() {
		conf.functions = { test_function: `create function test_function(a integer, b timestamptz)
			returns table(c text) AS $$
			BEGIN return query select 'hello'; END $$ LANGUAGE PLPGSQL` };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("changes a function", function() {
		conf.functions = { test_function: `create function test_function(a integer, b timestamptz)
			returns table(c text, d timestamptz) AS $$
			BEGIN return query select 'hello'; END $$ LANGUAGE PLPGSQL` };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("drops a function", function() {
		delete conf.functions.test_function;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds another type", function() {
		conf.types = { type2: { values: ["a", "b", "c"] } };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds a function using a type", function() {
		conf.functions = { test_function: `create function test_function(a type2) returns void AS $$BEGIN END$$ LANGUAGE PLPGSQL` };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("can't drop type used by function", function() {
		delete conf.types.type2;
		return expect(setup.transaction(client => exec(client, config.expand(conf),
			"public", "yaml"))).to.eventually.be.rejected;
	});

	it("drops enum type and function", function() {
		delete conf.functions.test_function;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds another table", function() {
		conf.tables.t2 = { columns: { id: "id" } };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("drops the table", function() {
		delete conf.tables.t2;
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

	it("adds a table with an index", function() {
		conf.tables.t3 = { columns: { a: "text", b: "text", c: { type: "bool", default: false } },
			indices: [ { columns: ['a', 'b' ] } ] };
		return setup.transaction(client => exec(client, config.expand(conf), "public", "yaml"));
	});

});
