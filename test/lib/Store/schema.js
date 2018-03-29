const Store = {
	graphql: 'type',
	schema: ['admin'],
	relayConnection: true,
	fields: {
		id: 'ID!',
		name: 'String!',
		shortName: 'String!',
		link: 'String!',
		domain: 'String!',
		status: 'String!',
		rating: 'Int!',
		createdAt: 'String!',
		updatedAt: 'String!',
	},
};

const store = {
	graphql: 'query',
	schema: ['admin'],
	name: 'store',
	type: 'Store',
	args: {
		id: 'ID',
		name: 'String',
		shortName: 'String',
		domain: 'String',
	},
};

const stores = {
	graphql: 'query',
	schema: ['admin'],
	name: 'stores',
	type: 'StoreConnection',
	args: {
		id: 'ID',
		name: 'String',
		shortName: 'String',
		domain: 'String',
		search: 'String',
		status: 'String',
		sort: 'String',
		order: 'String',
		$default: [
			'$paging',
		],
	},
};

const saveStore = {
	graphql: 'mutation',
	schema: ['admin'],
	name: 'saveStore',
	type: 'Store',
	args: {
		id: 'ID',
		name: 'String',
		shortName: 'String',
		link: 'URL',
		domain: 'String',
		status: 'String',
	},
};

const deleteStore = {
	graphql: 'mutation',
	schema: ['admin'],
	name: 'deleteStore',
	type: 'DeletedItem',
	args: {
		id: 'ID',
	},
};

export default {
	Store,
	store,
	stores,
	saveStore,
	deleteStore,
};
