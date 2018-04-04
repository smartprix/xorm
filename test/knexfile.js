const _ = require('lodash');
const config = require('../config.js');

const connection = _.merge({
	database: 'xorm',
}, config.db);

const testConnection = _.merge({
	database: 'xorm_test',
}, config.db);

const client = config.db.client || 'pg';

module.exports = {
	development: {
		client,
		debug: config.debug,
		connection,
		pool: {
			min: 2,
			max: 10,
		},
		migrations: {
			tableName: 'knex_migrations',
		},
	},

	staging: {
		client,
		connection,
		pool: {
			min: 2,
			max: 10,
		},
		migrations: {
			tableName: 'knex_migrations',
		},
	},

	production: {
		client,
		connection,
		pool: {
			min: 10,
			max: 50,
		},
		migrations: {
			tableName: 'knex_migrations',
		},
		seeds: {
			directory: './seeds',
		},
	},

	test: {
		client,
		connection: testConnection,
		pool: {
			min: 2,
			max: 10,
		},
		migrations: {
			tableName: 'knex_migrations',
		},
		seeds: {
			directory: './seeds/test',
		},
		debug: false,
	},
};
