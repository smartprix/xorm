import {getConnectionResolver} from 'gqutils';
import {Brand} from '../models';

export default {
	Query: {
		brand: Brand.getFindOneResolver(),

		async brands(root, args) {
			const query = Brand.query();

			if (args.id) {
				query.whereIn('id', args.id);
			}

			if (args.name) {
				query.where('name', args.name);
			}

			if (args.aliases) {
				query.where('aliases', args.aliases);
			}

			if (args.status) {
				query.where('status', args.status);
			}

			if (args.search) {
				query.where((q) => {
					q.whereIn('id', args.search.split(':'))
						.orWhere('name', 'like', `%${args.search}%`)
						.orWhere('aliases', 'like', `%${args.search}%`);
				});
			}

			return getConnectionResolver(query, args);
		},
	},

	Mutation: {
		async saveBrand(root, brand) {
			const duplicate = await Brand.getDuplicate(brand);

			if (duplicate) {
				throw new Brand.Error({name: 'Brand with this name/alias already exists'});
			}

			if (brand.aliases) {
				brand.aliases = brand.aliases.map(_.trim).join(',');
			}

			const categoryIds = brand.categoryIds;
			delete brand.categoryIds;

			const savedBrand = await Brand.query().saveAndFetch(brand);
			if (categoryIds) {
				await savedBrand.$relatedQuery('categories').unrelate();
			}

			// TODO: Use Batch Insert Here (Currently Works Only On Postgres)
			await Promise.map(categoryIds, categoryId => (
				savedBrand.$relatedQuery('categories').relate(categoryId)
			));

			return savedBrand;
		},

		deleteBrand: Brand.getDeleteByIdResolver(),
	},

	Brand: {
		aliases(brand) {
			if (!brand.aliases) return [];
			return brand.aliases.split(',');
		},

		categories: Brand.getRelationResolver('categories'),
	},
};
