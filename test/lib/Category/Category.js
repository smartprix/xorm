import {Model} from '../../../src/index';
import {Product} from '../models';
import CategoryExtractor from './CategoryExtractor';

const stringRequired = {
	type: 'string',
	required: true,
	minLength: 1,
};

class Category extends Model {
	static softDelete = true;

	static jsonSchema = {
		type: 'object',
		properties: {
			name: stringRequired,
			shortName: stringRequired,
			pluralName: stringRequired,
			status: stringRequired,
		},
	};

	static $relations() {
		this.belongsTo('Category', {
			name: 'parent',
			joinFrom: 'Category.parentId',
			joinTo: 'Category.id',
		});
		this.hasMany('Category', {
			name: 'children',
			joinFrom: 'Category.id',
			joinTo: 'Category.parentId',
		});
	}

	/**
	 * @return {Array} categoryIds array of all categories id fetched from DB.
	 */
	static async getAllIds() {
		const categories = await Category.query().select('id');
		return categories.map(category => category.id.toString());
	}

	/**
	 * [getParentTree description]
	 * @param  {Number}  [depth=0] [parent Depth]
	 * @return {Array}           [return parent Tree]
	 * if  A is parent of B and B is parent of C.
	 * C : parentTree
	 * 			[
	 * 				B: parentTrees [
	 * 					A : parentTrees []
	 * 				]
	 * 				A: parentTrees[]
	 * 			]
	 */
	async getParentTree(depth = 0) {
		const eager = depth ? `[parent.^${depth}]` : '[parent.^]';
		await this.$loadRelated(eager);

		let parent = this.parent;
		const tree = [];
		while (parent) {
			tree.push(parent);
			parent = parent.parent;
		}

		return tree.reverse();
	}


	/**
	 * [getChildrenTrees description]
	 * @param  {Number}  [depth=0] [children depth].
	 * @return {Array}   [return children trees].
	 * if  B and D are children of A and C is a child of B.
	 * A : childrenTrees[
	 * 			[
	 * 				B: childrenTrees [
	 * 					C : childrenTrees []
	 * 				]
	 * 				C: childrenTrees[]
	 * 			]
	 * 			[
	 * 				B: childrenTrees [
	 * 					C : childrenTrees []
	 * 				]
	 * 			]
	 * 			[
	 * 				D: childrenTrees[]
	 * 			]
	 * ]
	 *
	 */
	async getChildrenTrees(depth = 0) {
		const eager = depth ? `[children.^${depth}]` : '[children.^]';
		await this.$loadRelated(eager);

		const childrenTrees = [];

		const makeTree = (children, childTree) => {
			children.forEach((child) => {
				const tree = childTree.concat(child);

				if (child.children && child.children.length) {
					makeTree(child.children, tree);
				}

				childrenTrees.push(tree);
			});
		};

		makeTree(this.children, []);
		return childrenTrees;
	}

	// function get all products of a category.
	async getAllProducts() {
		const query = Product.query();
		const products = await query.where('categoryId', this.id);
		return products;
	}

	// // function to get instance of CategoryExtractor class.
	static async getExtractor() {
		const categories = await this.query()
			.eager('[parent.^]')
			.where({status: 'ACTIVE'});	// eager to petch related parent.

		categories.forEach((category) => {
			let parent = category.parent;
			const tree = [];
			while (parent) {
				tree.push(parent.id);
				parent = parent.parent;
			}

			category.parents = tree.reverse();
		});

		return new CategoryExtractor(categories);
	}

	/**
	 * [function to find duplicate category]
	 * @param  {object}  category [category details to save]
	 * @return {Promise}       [return duplicate category if category already exists
	 * 									in the Category table.]
	 */
	static async getDuplicate(category) {
		if (!category.aliases || !category.name) return null;

		const query = this.query();
		if (category.id) {
			query.whereNot('id', category.id);
		}

		query.where((q) => {
			if (category.aliases) {
				category.aliases.map(_.trim).forEach((alias) => {
					q.orWhere('name', alias);
					//  since aliases is in string form separated with comma
					//  so to match with first and last alias, string is concatenated with commas.
					//  CONCAT(',', ??, ',') => ',aliases,'.
					q.orWhereRaw("CONCAT(',', ??, ',') LIKE ?", ['aliases', `%,${alias},%`]);
				});
			}

			if (category.name) {
				q.orWhere('name', category.name);
				q.orWhereRaw("CONCAT(',', ??, ',') LIKE ?", ['aliases', `%,${category.name},%`]);
			}
		});

		return query.first();
	}
}

export default Category;
