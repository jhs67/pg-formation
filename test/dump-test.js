/* eslint-env node, mocha */

const expect = require("chai").expect;
const dump = require("../lib/dump");
const yaml = require('js-yaml');

const TestObject = {
	number: 3.14159,
	string: "A string",
	object: {
		a: 1,
		b: "2",
		c: "three"
	},
	array: [ "x", { "y": "z" } ],
	nested: {
		objects: {
			with: [ "array", "inside" ]
		}
	},
	nothing: null,
	complex: `string
with lots
	of tabs
  and other stuff`,
};

describe("Multi format object dump", function() {

	it("round trips in yaml", function() {
		const y = dump(TestObject, "yaml");
		const r = yaml.load(y);
		expect(r).to.deep.equal(TestObject);
	});

	it("round trips in json", function() {
		const y = dump(TestObject, "json");
		const r = JSON.parse(y);
		expect(r).to.deep.equal(TestObject);
	});

	it("round trips in js", function() {
		const y = dump(TestObject, "js");
		const m = new module.constructor();
		m._compile(y, "js_test_object.js");
		const r = m.exports;
		expect(r).to.deep.equal(TestObject);
	});

});
