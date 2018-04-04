import _ from 'lodash';

class BrandExtractor {
	/**
	 * @param  {Array} brands [all the active brands]
	 * make constructor contans [hash =>  hashing of all the active brands by their names and aliases,
	 * regex => regular expression of the brands name and their aliases for matching,
	 * replaceRegex => regular expression to replace some field like buy, new.									]
	 * ignoreRegex => regular expression of some fields like imported,
	 * serve pro, seller warrant etc to check if this expression contains these fields].
	 * */
	constructor(brands) {
		_.sortBy(brands, brand => 0 - brand.name.length);

		const hash = {};
		const brandNames = []; // used to store name of the brands and their aliases.

		brands.forEach((brand) => {
			if (brand.aliases) {
				const aliases = brand.aliases.split(',');
				aliases.forEach((alias) => {
					alias = alias.toLowerCase().replace(/[^a-z0-9]+/g, '');
					hash[alias] = brand;
					brandNames.push(alias);
				});
			}

			const name = brand.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
			hash[name] = brand;
			brandNames.push(name);
		});

		this.regex = new RegExp('^(?:' + brandNames.map(_.escapeRegExp).join('|') + ')');
		this.replaceRegex = new RegExp('^\\s*(?:buy|new)\\b', 'g');
		this.ignoreRegex = new RegExp('(?:imported|serve pro|seller warranty|combo|jodi|pack of |refurb|used)');
		this.hash = hash;
	}

	/**
	 * [function to find the brand by their names or aliases].
	 * @param  {string} name [name like hp or new hp (new will be replaced by '' using replaceRegex)]
	 * @return {object}      [brand]
	 */

	find(name) {
		name = name.toLowerCase();
		if (this.ignoreRegex.test(name)) return null;

		name = name.replace(this.replaceRegex, '').replace(/[^a-z0-9]+/g, '');

		const matches = name.match(this.regex);
		if (!matches) return null;
		return this.hash[matches[0]];
	}
}

export default BrandExtractor;
