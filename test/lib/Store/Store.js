import {Model} from '../../../src/index';

class Store extends Model {
	static softDelete = true;

	static jsonSchema = {
		type: 'object',
		required: [
			'name',
			'shortName',
			'link',
			'domain',
			'status',
		],
		properties: {
			name: {type: 'string', required: true, minLength: 1},
			shortName: {type: 'string', required: true, minLength: 1},
			link: {type: 'string', required: true, minLength: 1},
			domain: {type: 'string', required: true, minLength: 1},
			status: {type: 'string', required: true, minLength: 1},
		},
	};
}

export default Store;
