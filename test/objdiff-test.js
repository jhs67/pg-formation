/* eslint-env node, mocha */

const expect = require("chai").expect;
const objdiff = require("../lib/objdiff");

const LeftObj = {
	removed: "this key should be removed",

	unchanged: { this: "key is", unchange: [ "and", "should", "be", "ignored "] },

	changed: { there: "is", a: "subtle", c: [ "change to", "this key" ] },
};

const RightObj = {
	added: "this key was added",

	unchanged: { this: "key is", unchange: [ "and", "should", "be", "ignored "] },

	changed: { there: "is", a: "subtle", c: [ "change to this", "key" ] },
};

describe("Object difference generator", function() {
	it("determines the differences", function() {
		let r = objdiff(LeftObj, RightObj);
		expect(r).to.deep.equal({ add: [ "added" ], remove: [ "removed" ], change: [ "changed" ] });
	});

	it("reports unchanged objects", function() {
		let r = objdiff(LeftObj, LeftObj);
		expect(r).to.deep.equal({ add: [], remove: [], change: [] });
	});
});
