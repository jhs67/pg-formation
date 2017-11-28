
const pg = require('pg');
const path = require('path');
const fs = require('fs-extra');
const format = require('pg-format');

function connectParams() {
	return fs.readJson(path.resolve(__dirname, "../../test.json"));
}

function withConnect(client, fn) {
	return client.connect()
	.then(() => {
		return fn(client)
		.catch(err => client.end().then(() => Promise.reject(err)))
		.then(res => client.end().then(() => res));
	});
}

function rootClient(fn) {
	return connectParams()
	.then(params => {
		params.database = "postgres";
		return withConnect(new pg.Client(params), fn);
	});
}

module.exports.cleanup = cleanup;
function cleanup() {
	return rootClient(client => connectParams().then(params => {
		return client.query(format("DROP DATABASE IF EXISTS %I", params.database));
	}));
}

function setup() {
	return rootClient(client => connectParams().then(params => {
		return client.query(format("CREATE DATABASE %I", params.database));
	}));
}

module.exports.client = client;
function client(fn) {
	return connectParams()
	.then(params => withConnect(new pg.Client(params), fn));
}

module.exports.cleanSlate = cleanSlate;
function cleanSlate() {
	return cleanup()
	.then(() => setup());
}
