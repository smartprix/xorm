const _ = require('lodash');

const config = {
	debug: false,
	db: {
		host: '127.0.0.1',
		client: 'pg',
		port: 5432,
		user: 'root',
		password: 'smartprix',
	},

	development: {
		port: 3000,
	},

	test: {
		port: 5000,
		wwwUrl: 'http://localhost:5000',
	},

	encryptionKey: 'is73SCNDSt0jVFoZAVEFX31Ry1UJYU',
};

// Read private config and merge it with this config
try {
	const configPrivate = require('./private/config.js');	// eslint-disable-line
	module.exports = _.assign(config, configPrivate);
}
catch (e) {
	module.exports = config;
}
