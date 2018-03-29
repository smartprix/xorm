/* eslint-disable import/no-dynamic-require, global-require */
import path from 'path';

const exported = {};

const models = [
	'Store',
	'KnexUtils',
];

const modelMap = {};
models.forEach((model) => {
	try {
		modelMap[model] = require.resolve(path.resolve(__dirname, model) + '/' + model);
	}
	catch (e) {
		modelMap[model] = require.resolve(path.resolve(__dirname, model));
	}
});

// Hack to solve circular dependency
function requireModels() {
	models.forEach((model) => {
		const modelPath = modelMap[model];
		delete require.cache[modelPath];

		const required = require(modelPath);
		exported[model] = required.default || required;

		try {
			// Delete resolver from cache
			let resolverPath = model + '/resolvers';
			resolverPath = require.resolve(path.resolve(__dirname, resolverPath));
			delete require.cache[resolverPath];
			require(resolverPath);
		}
		catch (e) {
			// Resolver does not exist
		}
	});

	models.forEach((model) => {
		const modelPath = modelMap[model];
		delete require.cache[modelPath];

		const required = require(modelPath);
		exported[model] = required.default || required;
	});
}

models.forEach((model) => {
	exported[model] = new Proxy({}, {
		// eslint-disable-next-line
		get(obj, prop) {
			return (function () {});
		},
	});
});

module.exports = exported;

models.forEach((model) => {
	const modelPath = modelMap[model];
	require(modelPath);
});

requireModels();
