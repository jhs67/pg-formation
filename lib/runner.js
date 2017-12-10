
const pg = require('pg');
const exec = require('./exec');
const scan = require('./scan');
const dump = require('./dump');
const load = require('./load');
const config = require('./config');
const generate = require('./generator');

class Runner {
	constructor(opt) {
		this.opt = opt;
	}

	client(fn) {
		const client = new pg.Client(this.opt.databaseUrl);
		return client.connect()
		.then(() => {
			return fn(client)
			.catch(err => client.end().then(() => Promise.reject(err)))
			.then(res => client.end().then(() => res));
		});
	}

	transaction(fn) {
		return this.client(client => {
			return client.query("BEGIN")
			.then(() => {
				return fn(client)
				.catch(err => client.query("ROLLBACK").then(() => Promise.reject(err)))
				.then(res => client.query("COMMIT").then(() => res));
			});
		});
	}

	dump() {
		return this.transaction(client => {
			return scan.load(client, this.opt.databaseSchema)
			.then(s => dump(config.contract(s), this.opt.configFormat));
		});
	}

	parse() {
		return load(this.opt.configFile, this.opt.functionFile)
		.then(c => dump(config.contract(c), this.opt.configFormat));
	}

	show() {
		return Promise.all([
			this.transaction(client => scan.load(client, this.opt.databaseSchema)),
			load(this.opt.configFile, this.opt.functionFile)
		])
		.then(([s, l]) => generate(s, l))
		.then(cmds => cmds.length ? cmds.join(";\n") + ";\n" : "");
	}

	run() {
		return load(this.opt.configFile, this.opt.functionFile)
		.then(l => this.transaction(client => exec(client, l,
			this.opt.databaseSchema, this.opt.configFormat)))
		.then(cmds => cmds.length  ? cmds.join(";\n") + ";\n" : "");
	}
}
exports.Runner = Runner;

Runner.prototype.dump.describe = "Dump the contents of an existing database";
Runner.prototype.parse.describe = "Parse the configuration and dump the normalized contents";
Runner.prototype.show.describe = "Show the statements needed to update the database";
Runner.prototype.run.describe = "Run the update statements and check the updated database";
