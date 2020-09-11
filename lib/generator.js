
const objdiff = require("./objdiff");
const format = require('pg-format');
const deparser = require("./deparser");
const pgquery = require("pg-query-emscripten");
const deepEql = require("deep-eql");

function parseFunction(f) {
	let r = pgquery.parse(f).parse_tree;
	delete r[0].RawStmt.stmt.CreateFunctionStmt.replace;
	return r;
}

generate.normalizeFunction = normalizeFunction;
function normalizeFunction(f) {
	return deparser.deparse(parseFunction(f));
}

function arrify(v) {
	return !v ? [] : Array.isArray(v) ? v : [v];
}

function stripLocation(obj) {
	if (Array.isArray(obj)) {
		return obj.map(v => stripLocation(v));
	}
	else if (obj && typeof obj === 'object') {
		let r = {};
		Object.keys(obj).filter(k => k !== "location" && k !== "stmt_len").forEach(k => r[k] = stripLocation(obj[k]));
		return r;
	}
	else {
		return obj;
	}
}

function funcdiff(from, to) {
	let fparse = stripLocation(parseFunction(from));
	let tparse = stripLocation(parseFunction(to));
	return deepEql(fparse, tparse);
}

class Generator {
	constructor() {
		this.cmds = [];
	}

	sortCmds() {
		let sort = [];
		while (this.cmds.length) {
			for (let i = 0; ; i += 1) {
				if (i === this.cmds.length)
					throw new Error("circular dependencies");
				const c = this.cmds[i];

				// if anything we depend on isn't fully provided wait
				if (c.depends.some(p => this.cmds.some(d => d.provides.some(q => q === p))))
					continue;

				// if what we remove is still depended on wait
				if (c.removes.some(p => this.cmds.some(d => d.depends.some(q => q === p))))
					continue;

				this.cmds.splice(i, 1);
				sort = sort.concat(c.cmd);
				break;
			}
		}
		return sort;
	}

	parsedTypeDep(v) {
		// get the type with qualifiers and arrays removed
		return `type.${deparser.deparse([{ TypeName: { names: v.TypeName.names } }])}`;
	}

	typeDep(n) {
		// parse it as a type
		let c = pgquery.parse(`CREATE TABLE t (c ${n})`);
		if (c.error) return [];
		// extract the type from the table
		let p = c.parse_tree[0].RawStmt.stmt.CreateStmt.tableElts[0].ColumnDef.typeName;
		return this.parsedTypeDep(p);
	}

	addCmd(cmd, provides, depends, removes) {
		this.cmds.push({ cmd: arrify(cmd), provides: arrify(provides),
			depends: arrify(depends), removes: arrify(removes) });
	}

	createIndex(table, name, def) {
		const cmd = format("CREATE%s INDEX %I ON %I USING %s (%s)",
			def.unique ? " UNIQUE" : "", name, table,
			def.method, def.columns.map(c => format("%I", c)).join(", "));
		this.addCmd(cmd, `index.${table}.${name}`,
			def.columns.map(c => `table.${table}.${c}`));
	}

	alterIndex(table, name, from, to) {
		this.addCmd([
			format("DROP INDEX %I", name),
			format("CREATE%s INDEX %I ON %I USING %s (%s)",
				to.unique ? " UNIQUE" : "", name, table,
				to.method, to.columns.map(c => format("%I", c)).join(", "))
		], `index.${table}.${name}`,
			[ ...to.columns.map(c => `table.${table}.${c}`),
				...from.columns.map(c => `table.${table}.${c}`) ]);
	}

	dropIndex(table, name, def) {
		this.addCmd(format("DROP INDEX %I", name), [], def.columns.map(c => `table.${table}.${c}`),
			`index.${table}.${name}`);
	}

	columnDef(name, def, deps) {
		let r = [ format("%I %s", name, def.type) ];
		deps.push(this.typeDep(def.type));

		if (def.primarykey) {
			r.push("PRIMARY KEY");
		}
		else {
			if (def.unique)
				r.push("UNIQUE");
			if (def.notnull)
				r.push("NOT NULL");
		}

		if ('default' in def) {
			r.push(format("DEFAULT %L", def.default));
		}

		return r.join(' ');
	}

	createReference(name, column, def) {
		if (!def.references)
			return;
		const deps = [`table.${name}`, `table.${name}.${column}`, `table.${def.references}`];
		let p = format("ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES %I",
			name, `${name}_${def.references}_key`, column, def.references);
		this.addCmd(p, [`reference.${name}.${column}`], deps);
	}

	createTable(name, def) {
		let deps = [];
		let cmd = format("CREATE TABLE %I (\n  %s)", name,
			Object.keys(def.columns).map(
				n => this.columnDef(n, def.columns[n], deps)).join(",\n  "));
		let prov = [ `table.${name}`, ...Object.keys(def.columns).map(n => `table.${name}.${n}`)];
		this.addCmd(cmd, prov, deps);

		for (let i in def.indices)
			this.createIndex(name, i, def.indices[i]);

		for (let i in def.columns)
			if (def.columns[i].references)
				this.createReference(name, i, def.columns[i]);
	}

	alterTable(name, from, to) {
		const columndiff = objdiff(from.columns, to.columns);

		let p = format("ALTER TABLE %I ", name);
		for (let k of columndiff.add) {
			let deps = [];
			let cmd = p + format("ADD %s", this.columnDef(k, to.columns[k], deps));
			this.addCmd(cmd, `table.${name}.${k}`, deps);
		}

		for (let k of columndiff.change) {
			let f = from.columns[k], t = to.columns[k];
			let c = [], provides = [`table.${name}.${k}`];
			let deps = [this.typeDep(t.type), this.typeDep(f.type)];
			let removes = [];
			if (f.type !== t.type) {
				c.push(p + format("ALTER %I TYPE %s", k, t.type));
				deps.push();
			}

			if (f.primarykey && !t.primarykey) {
				c.push(p + format("DROP CONSTRAINT %I", `${name}_pkey`));
				if (t.unique)
					c.push(p + format("ADD UNIQUE (%I)", k));
				if (!t.notnull)
					c.push(p + format("ALTER %I DROP NOT NULL", k));
				provides.push(`table.${name}`);
			}
			else if (t.primarykey && !f.primarykey) {
				if (f.unique)
					c.push(p + format("DROP CONSTRAINT %I", `${name}_${k}_key`));
				if (f.notnull)
					c.push(p + format("ALTER %I DROP NOT NULL", k));
				c.push(p + format("ADD PRIMARY KEY (%I)", k));
				provides.push(`table.${name}`);
			}
			else if (!t.primarykey) {
				if (f.unique && !t.unique)
					c.push(p + format("DROP CONSTRAINT %I", `${name}_${k}_key`));
				if (t.unique && !f.unique)
					c.push(p + format("ADD UNIQUE (%I)", k));

				if (f.notnull && !t.notnull)
					c.push(p + format("ALTER %I DROP NOT NULL", k));
				else if (!f.notnull && t.notnull)
					c.push(p + format("ALTER %I ADD NOT NULL", k));
			}

			if (f.references && f.references != t.references) {
				c.push(p + format("DROP CONSTRAINT %I", `${name}_${f.references}_key`));
				deps.push(`table.${f.references}`);
				removes.push(`reference.${name}.${k}`);
			}

			if (('default' in f) && !('default' in t))
				c.push(p + format("ALTER %I DROP DEFAULT", k));
			else if (('default' in t) && f.default !== t.default)
				c.push(p + format("ALTER %I SET DEFAULT %L", k, t.default));

			this.addCmd(c, provides, deps, removes);
		}

		for (let k of columndiff.remove) {
			this.addCmd(p + format("DROP %I", k), [],
				[ this.typeDep(from.columns[k].type) ], `table.${name}.${k}`);
		}

		for (let k of columndiff.add) {
			let t = to.columns[k];
			if (t && t.references)
				this.createReference(name, k, t);
		}

		for (let k of columndiff.change) {
			let f = from.columns[k], t = to.columns[k];
			if (t.references && t.references !== f.references)
				this.createReference(name, k, t);
		}

		const indicesdiff = objdiff(from.indices, to.indices);
		for (let k of indicesdiff.add) {
			this.createIndex(name, k, to.indices[k]);
		}

		for (let k of indicesdiff.change) {
			this.alterIndex(name, k, from.indices[k], to.indices[k]);
		}

		for (let k of indicesdiff.remove) {
			this.dropIndex(name, k, from.indices[k]);
		}
	}

	dropTable(name, def) {
		this.addCmd(format("DROP TABLE %I", name), [], [],
			[ `table.${name}`, ...Object.keys(def.columns).map(n => `table.${name}.${n}`),
				...Object.keys(def.indices).map(k => `index.${name}.${k}`),
				...Object.entries(def.columns).filter(([n, def]) => def.references).map(k => `reference.${name}.${k}`)]);
	}

	createType(name, def) {
		this.addCmd(format("CREATE TYPE %I AS ENUM (%s)", name,
			def.values.map(c => format("%L", c)).join(", ")), `type.${name}`);
	}

	alterType(name, from, to, src) {
		let c = [];

		// drop any functions depending on the old type
		let fns = [];
		Object.keys(src.functions).forEach(fn => {
			let f = src.functions[fn];
			let pf = parseFunction(f);
			let m = pf[0].RawStmt.stmt.CreateFunctionStmt.parameters.some(
				p => this.parsedTypeDep(p.FunctionParameter.argType) == `type.${name}`);
			if (m) {
				fns.push(pf);
				c.push(this.dropFunctionCmd(pf[0].RawStmt.stmt.CreateFunctionStmt));
			}
		});

		// rename the old type
		c.push(format("ALTER TYPE %I RENAME TO %I", name,
			`${name}_alter_type`));

		// create the updated type
		c.push(format("CREATE TYPE %I AS ENUM (%s)", name,
			to.values.map(c => format("%L", c)).join(", ")));

		// find any columns that reference the old type
		Object.keys(src.tables).forEach(tn => {
			let t = src.tables[tn];
			Object.keys(t.columns).forEach(cn => {
				let cd = t.columns[cn];
				if (this.typeDep(cd.type) === `type.${name}`) {
					c.push(format("ALTER TABLE %I ALTER COLUMN %I TYPE %s USING %I::text::%I",
						tn, cn, name, cn, name));
				}
			});
		});

		// drop the old type
		c.push(format("DROP TYPE %I", `${name}_alter_type`));

		// recreate functions with new type
		fns.forEach(pf => {
			c.push(deparser.deparse(pf));
		});

		this.addCmd(c, `type.${name}`);
	}

	dropType(name) {
		this.addCmd(format("DROP TYPE %I", name), [], [], `type.${name}`);
	}

	createFunction(name, def) {
		let c = parseFunction(def);
		let deps = c[0].RawStmt.stmt.CreateFunctionStmt.parameters.map(p => this.parsedTypeDep(p.FunctionParameter.argType));
		this.addCmd(deparser.deparse(c), `function.${name}`, deps);
	}

	dropFunctionCmd(c) {
		return deparser.deparse([ { DropStmt: {
			objects: [{
				ObjectWithArgs: {
					objname: c.funcname,
					objargs: c.parameters.filter(v => v.FunctionParameter.mode === 105)
						.map(v => v.FunctionParameter.argType)
				}
			}],
			removeType: deparser.dropFunctionType(),
		}}]);
	}

	alterFunction(name, from, to) {
		let pf = parseFunction(from);
		let pt = parseFunction(to);
		let deps = [...pf[0].RawStmt.stmt.CreateFunctionStmt.parameters.map(p => this.parsedTypeDep(p.FunctionParameter.argType)),
			...pt[0].RawStmt.stmt.CreateFunctionStmt.parameters.map(p => this.parsedTypeDep(p.FunctionParameter.argType))];
		this.addCmd([ this.dropFunctionCmd(pf[0].RawStmt.stmt.CreateFunctionStmt), deparser.deparse(pt) ], `function.${name}`, deps);
	}

	dropFunction(name, def) {
		let pf = parseFunction(def);
		let deps = [...pf[0].RawStmt.stmt.CreateFunctionStmt.parameters.map(p => this.parsedTypeDep(p.FunctionParameter.argType))];
		this.addCmd(this.dropFunctionCmd(pf[0].RawStmt.stmt.CreateFunctionStmt), [], deps, `function.${name}`);
	}

	generate(from, to) {
		const typediff = objdiff(from.types, to.types);

		for (let k of typediff.add) {
			this.createType(k, to.types[k]);
		}

		for (let k of typediff.change) {
			this.alterType(k, from.types[k], to.types[k], from);
		}

		for (let k of typediff.remove) {
			this.dropType(k);
		}

		const tablediff = objdiff(from.tables, to.tables);

		for (let k of tablediff.add) {
			this.createTable(k, to.tables[k]);
		}

		for (let k of tablediff.change) {
			this.alterTable(k, from.tables[k], to.tables[k]);
		}

		for (let k of tablediff.remove) {
			this.dropTable(k, from.tables[k]);
		}

		const functiondiff = objdiff(from.functions, to.functions, funcdiff);

		for (let k of functiondiff.add) {
			this.createFunction(k, to.functions[k]);
		}

		for (let k of functiondiff.change) {
			this.alterFunction(k, from.functions[k], to.functions[k]);
		}

		for (let k of functiondiff.remove) {
			this.dropFunction(k, from.functions[k]);
		}

		return this.sortCmds();
	}
}

module.exports = generate;
function generate(from, to) {
	let g = new Generator();
	return g.generate(from, to);
}
