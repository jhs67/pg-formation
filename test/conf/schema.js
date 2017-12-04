module.exports = {
	tables: {
		js: {
			columns: {
				id: { type: "serial", primarykey: true },
				another: { type: "text", unique: true },
				bold: { type: "text"},
			},
			indices: [
				{ name: "explicit_name", columns: ["another", "bold"], unique: true },
			]
		}
	}
};
