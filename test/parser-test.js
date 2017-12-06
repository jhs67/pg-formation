/* eslint-env node, mocha */

const expect = require("chai").expect;
const pgquery = require("pg-query-emscripten");
const deparser = require("../lib/deparser");

const TestBody = `
-- one line comments inside should be preserved
BEGIN
END
`;

const TestFunction =`
-- A header comment
CREATE FUNCTION test_function("Arg" /* comments */ integer, ARG2 "weird""quotes")
RETURNS void -- more comments
AS $tag$${TestBody}$tag$ LANGUAGE /* even /* nested
*/ comments */ plpgsql
;`;

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

describe("Parses test function", function() {
	it("parses the test function", function() {
		let v = pgquery.parse(TestFunction);
		expect(v.error).to.equal(null);
		expect(Array.isArray(v.parse_tree));
		expect(v.parse_tree.length).to.equal(1);
		expect(Object.keys(v.parse_tree[0])).to.deep.equal([ "CreateFunctionStmt" ]);
	});

	it("deparses the test function", function() {
		let v = pgquery.parse(TestFunction);
		let n = deparser.deparse(v.parse_tree);
		let w = pgquery.parse(n);
		expect(stripLocation(v)).to.deep.equal(stripLocation(w));
	});

	it("turns create function into drop function", function() {
		let v = pgquery.parse(TestFunction);
		let c = v.parse_tree[0].CreateFunctionStmt;
		let d = [ { DropStmt: {
			objects: [ c.funcname ],
			arguments: [ c.parameters.map(v => v.FunctionParameter.argType) ],
			removeType: 18,
			behavior: 0,
		}}];
		let n = deparser.deparse(d);
		let w = pgquery.parse(n);
		expect(stripLocation(d)).to.deep.equal(stripLocation(w.parse_tree));
	});
});
