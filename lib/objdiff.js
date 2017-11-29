
const deepEql = require("deep-eql");

module.exports = objdiff;
function objdiff(l, r) {
	const ln = Object.keys(l).sort();
	const rn = Object.keys(r).sort();

	const add = [];
	const remove = [];
	const change = [];

	for (let li = 0, ri = 0; li < ln.length || ri < rn.length;) {
		if (li === ln.length || rn[ri] < ln[li]) {
			add.push(rn[ri]);
			ri += 1;
		}
		else if (ri === rn.length || ln[li] < rn[ri]) {
			remove.push(ln[li]);
			li += 1;
		}
		else {
			if (!deepEql(l[ln[li]], r[rn[ri]]))
				change.push(ln[li]);
			li += 1;
			ri += 1;
		}
	}

	return { add, remove, change };
}
