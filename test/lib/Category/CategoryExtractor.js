import _ from 'lodash';

class CategoryExtractor {
	/**
	 * @param  {Array} categories [all the active categories]
	 * constructor contains [hash =>  hashing of all the active categories by their names
	 * and aliases,
	 * regex => regular expression of the categories name and their aliases for matching.
	 * */
	constructor(categories) {
		const hash = {};
		let categoryNames = []; // used to store name of the categories and their aliases.

		categories.forEach((category) => {
			if (category.aliases) {
				const aliases = category.aliases.split(',');
				aliases.forEach((alias) => {
					alias = alias.toLowerCase().replace(/[^a-z0-9]+/g, '');
					hash[alias] = category;
					categoryNames.push(alias);
				});
			}

			const name = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
			hash[name] = category;
			categoryNames.push(name);
		});

		categoryNames = _.sortBy(categoryNames, name => 0 - name.length);
		this.regex = new RegExp('(?:' + categoryNames.map(_.escapeRegExp).join('|') + ')', 'g');
		this.hash = hash;
	}

	/** if categorypath has single category(sm's) => return category
	* find all matching non-overlapping categories from categorypath
	* make category tree from found categories
	* 	if only one tree => highest depth category found
	* 	if more than one tree => conflicting, no category found
	*	Example: foundCategories = [A, B, C, D, E]
	*		if tree {C->E} and D has no ancestor in foundCategories => E is category
	*		if tree {D->E} => E is category
	*		if tree {C->E, A->D} => no category found
	*		if tree {C->E->D} => D is category
	*
	* @categoryPath: category path of the product
	* @return: category found or null
	* */
	find(categoryPath) {
		categoryPath = categoryPath.toLowerCase().replace('&', 'and').replace(/[^a-z0-9]+/g, '');

		// exact and only category found
		const category = this.hash[categoryPath];
		if (category) return category;

		// find all matching distinct, non-overlapping categories (in path)
		let match;
		let nextIndex;
		const matches = [];
		const categoryIds = [];
		// reset regex matches (search from beginning)
		this.regex.lastIndex = 0;
		// eslint-disable-next-line
		while (match = this.regex.exec(categoryPath)) {
			if (nextIndex && nextIndex !== match.index) break;	// to avoid product name

			const cat = this.hash[match[0]];
			if (!categoryIds.includes(cat.id)) {
				categoryIds.push(cat.id);
				matches.push(cat);
			}

			nextIndex = match.index + match[0].length;
		}

		// Only one category found (from path)
		if (categoryIds.length === 1) {
			return matches.pop();
		}

		// console.log('Category IDs: ', categoryIds);
		let finalCategory = null;
		let limit = -1;
		for (let i = matches.length - 1; i > limit; i--) {
			const cat = matches[i];
			const parentIndex = CategoryExtractor.closestAncestor(categoryIds.slice(0, i), cat.parents);
			if (parentIndex !== -1) {
				if (!finalCategory || cat.parents.includes(finalCategory.id)) {
					limit = parentIndex;
					finalCategory = cat;
				}
				else {
					finalCategory = null;
					break;
				}
			}
		}

		return finalCategory;
	}

	/** finds largest index of any ancestor in catIds
	* if no ancestor found then return -1
	*
	* @catIds: array of Ids to search from
	* @parentIds: Ids of ancestors
	* @return: index in catId or -1 if parent not found
	* */
	static closestAncestor(catIds, parentIds) {
		for (let i = catIds.length - 1; i >= 0; i--) {
			if (parentIds.includes(catIds[i])) {
				return i;
			}
		}
		return -1;
	}
}

export default CategoryExtractor;
