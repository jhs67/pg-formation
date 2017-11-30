module.exports = {
	tables: {
		js: {
			columns: {
				id: { type: "serial", primaryKey: true },
				another: { type: "text", unique: true },
				bold: { type: "text"},
			},
			indices: [
				{ name: "explicit_name", columns: ["another", "bold"], unique: true },
			]
		}
	}
};
