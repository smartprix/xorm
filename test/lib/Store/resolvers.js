import {getConnectionResolver} from 'gqutils';
import {Store} from '../models';

export default {
	Query: {
		async store(root, {id, name}) {
			const query = Store.query();
			if (id) return query.findById(id);
			if (name) return query.where({name}).first();
			return null;
		},

		async stores(root, args) {
			const query = Store.query();

			if (args.id) {
				query.where('id', args.id);
			}

			if (args.name) {
				query.where('name', args.name);
			}

			if (args.shortName) {
				query.where('shortName', args.shortName);
			}

			if (args.domain) {
				query.where('domain', args.domain);
			}

			if (args.status) {
				query.where('status', args.status);
			}

			if (args.search) {
				query.where((q) => {
					q.whereIn('id', args.search.split(':'))
						.orWhere('name', 'like', `%${args.search}%`)
						.orWhere('shortName', 'like', `%${args.search}%`);
				});
			}

			if (args.sort) {
				const order = args.order || 'ASC';
				query.orderBy(args.sort, order);
			}

			return getConnectionResolver(query, args);
		},
	},

	Mutation: {
		saveStore(root, store) {
			return Store.query().saveAndFetch(store);
		},

		deleteStore: Store.getDeleteByIdResolver(),
	},
};
