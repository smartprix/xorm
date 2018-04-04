const Brand = {
	graphql: 'type',
	schema: ['admin'],
	relayConnection: true,
	fields: {
		id: 'ID!',
		name: 'String!',
		aliases: '[String]',
		status: 'String!',
		createdAt: 'String!',
		updatedAt: 'String!',
		categories: '[Category]',
	},
};

const getBrand = {
	graphql: 'query',
	schema: ['admin'],
	name: 'brand',
	type: 'Brand',
	args: {
		$default: ['id', 'name'],
	},
};

const getBrands = {
	graphql: 'query',
	schema: ['admin'],
	name: 'brands',
	type: 'BrandConnection',
	args: {
		$default: [
			'$paging',
			'name',
			'status',
		],
		id: '[ID]',
		search: 'String',
		aliases: 'String',
	},
};

const saveBrand = {
	graphql: 'mutation',
	schema: ['admin'],
	type: 'Brand',
	args: {
		$default: [
			'id',
			'name',
			'aliases',
			'status',
			'logoId',
		],
		categoryIds: '[ID]',
	},
};

const deleteBrand = {
	graphql: 'mutation',
	schema: ['admin'],
	type: 'DeletedItem',
	args: {
		id: 'ID',
	},
};

export default {
	Brand,
	getBrand,
	getBrands,
	saveBrand,
	deleteBrand,
};
