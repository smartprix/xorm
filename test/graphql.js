import path from 'path';
import {makeSchemaFromModules} from 'gqutils';

const modules = [
	'Store',
];

const logger = {
	log(e) {
		d(e);
	},
};

const {schema, pubsub} =
	makeSchemaFromModules(modules, {
		baseFolder: path.join(__dirname, '/lib'),
		schema: ['admin'],
		logger,
		allowUndefinedInResolve: false,
		resolverValidationOptions: {},
	});

pubsub.out = function (key, message) {
	pubsub.publish('output', {key, message});
};

global.pubsub = pubsub;

export {
	schema,
	pubsub,
};
