import {Model} from '../../../src/index';
import BrandExtractor from './BrandExtractor';

class Brand extends Model {
	static softDelete = true;

	static jsonSchema = {
		type: 'object',
		properties: {
			name: {type: 'string', required: true, minLength: 1},
			status: {type: 'string', required: true, minLength: 1},
		},
	};

	static $relations() {
		this.hasManyThrough('Category', {
			name: 'categories',
			through: {
				from: 'BrandCategoryMap.brandId',
				to: 'BrandCategoryMap.categoryId',
			},
		});
	}

	// function to extract instance of BrandExtractor class.
	static async getExtractor() {
		const brands = await this.query().where({status: 'ACTIVE'});
		return new BrandExtractor(brands);
	}

	/**
	 * [function to find duplicate brand]
	 * @param  {object}  brand [brand details to save]
	 * @return {Promise}       [return duplicate brand if brand already exists in the table.]
	 */
	static async getDuplicate(brand) {
		if (!brand.aliases || !brand.name) return null;

		const query = this.query();
		if (brand.id) {
			query.whereNot('id', brand.id);
		}

		query.where((q) => {
			if (brand.aliases) {
				brand.aliases.map(_.trim).forEach((alias) => {
					q.orWhere('name', alias);
					//  since aliases is in string form separated with comma
					//  so to match with first and last alias string is concatenated with commas.
					//  CONCAT(',', ??, ',') => ',aliases,'
					q.orWhereRaw("CONCAT(',', ??, ',') LIKE ?", ['aliases', `%,${alias},%`]);
				});
			}

			if (brand.name) {
				q.orWhere('name', brand.name);
				q.orWhereRaw("CONCAT(',', ??, ',') LIKE ?", ['aliases', `%,${brand.name},%`]);
			}
		});

		return query.first();
	}
}

export default Brand;
