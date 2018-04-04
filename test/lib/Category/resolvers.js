import {getConnectionResolver} from 'gqutils';
import {Category} from '../models';

export default {
	Query: {
		category: Category.getFindOneResolver(),

		async categories(root, args) {
			const query = Category.query();

			if (args.id) {
				query.whereIn('id', args.id);
			}

			if (args.name) {
				query.where('name', args.name);
			}

			if (args.shortName) {
				query.where('shortName', args.shortName);
			}

			if (args.pluralName) {
				query.where('pluralName', args.pluralName);
			}

			if (args.parentId) {
				query.where('parentId', args.parentId);
			}

			if (args.status) {
				query.where('status', args.status);
			}

			if (args.search) {
				query.where((q) => {
					q.whereIn('id', args.search.split(':'))
						.orWhere('name', 'like', `%${args.search}%`)
						.orWhere('shortName', 'like', `%${args.search}%`)
						.orWhere('aliases', 'like', `%${args.search}%`);
				});
			}

			return getConnectionResolver(query, args);
		},
	},

	Mutation: {
		async saveCategory(root, category) {
			const duplicate = await Category.getDuplicate(category);

			if (duplicate) {
				throw new Category.Error({name: 'Category with this name/alias already exists'});
			}

			if (category.aliases) {
				category.aliases = category.aliases.map(_.trim).join(',');
			}

			return Category.query().saveAndFetch(category);
		},

		deleteCategory: Category.getDeleteByIdResolver(),
	},

	Category: {
		aliases(brand) {
			if (!brand.aliases) return [];
			return brand.aliases.split(',');
		},

		parent: Category.getRelationResolver('parent'),

		async parentTree(category, {depth}) {
			return category.getParentTree(depth);
		},

		children: Category.getRelationResolver('children'),

		async childrenTrees(category, {depth}) {
			return category.getChildrenTrees(depth);
		},
	},
};
