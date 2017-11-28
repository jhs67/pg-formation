
const pg = require('pg');
const scan = require('./scan');
const dump = require('./dump');

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
			.then(s => dump(s, this.opt.configFormat));
		});
	}
}
exports.Runner = Runner;

Runner.prototype.dump.describe = "Dump the contents of an existing database";
