/* eslint-disable import/no-dynamic-require, global-require */
import path from 'path';
import _ from 'lodash';
import {Model, AjvValidator} from 'objection';
import DataLoader from 'dataloader';
import {Cache, RedisCache} from 'sm-utils';
import BaseQueryBuilder from './query_builder';
import {plural} from './utils';
import {customUserError} from './user_error';

let LocalRedisCache = RedisCache;

const httpUrlPattern = new RegExp(
	'^(https?:\\/\\/)?' + // protocol
	'((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.?)+[a-z]{2,}|' + // domain name
	'((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
	'(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
	'(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
	'(\\#[-a-z\\d_]*)?$', 'i' // fragment locator
);

function mapResults(results, keys, columnName) {
	const resultHash = {};
	const mappedResults = [];

	if (Array.isArray(columnName)) {
		if (columnName.length === 1) {
			columnName = columnName[0];
		}
		else {
			for (const key of keys) {
				const found = results.find(result => (
					// we need == here because result can either return a string or a number
					// eslint-disable-next-line eqeqeq
					columnName.every((k, i) => result[k] == key[i])
				));

				mappedResults.push(found || null);
			}

			return mappedResults;
		}
	}

	for (const result of results) {
		resultHash[result[columnName]] = result;
	}

	for (const key of keys) {
		mappedResults.push(resultHash[key] || null);
	}

	return mappedResults;
}

function mapManyResults(results, keys, columnName) {
	const resultHash = {};
	const mappedResults = [];

	for (const result of results) {
		const column = result[columnName];
		resultHash[column] = resultHash[column] || [];
		resultHash[column].push(result);
	}

	for (const key of keys) {
		mappedResults.push(resultHash[key] || []);
	}

	return mappedResults;
}

async function handleResult(obj, options) {
	if (!obj) {
		if (!options.default) {
			return null;
		}

		options.isDefault = true;

		if (typeof options.default === 'function') {
			obj = await options.default(options.args);
		}
		else {
			obj = await options.default;
		}
	}

	if (Array.isArray(obj)) {
		return Promise.all(obj.map(item => handleResult(item, options)));
	}
	if (obj.afterResolve) {
		return obj.afterResolve(options);
	}
	return obj;
}

/**
 * @template T
 * @template X
 * @param {T[]} values
 * @param {Object} [options]
 * @param {(vals: T[]) => Promise<X[]>} [options.fn]
 * @param {number} [options.limit]
 * @param {number} [options.offset] default is 0
 * @param {boolean} [options.nonNull] default is false
 * @returns {Promise<X[]>}
 */
async function limitFilter(values, options = {}) {
	const {limit, offset = 0, nonNull = false, fn = v => v} = options;
	if (limit === 0 || offset >= values.length) return [];

	if (!limit || limit >= values.length) {
		let results = (await fn(values)) || [];
		if (nonNull) results = results.filter(val => val != null);
		return results;
	}

	let results = (await fn(values.slice(offset, limit))) || [];
	if (nonNull) results = results.filter(val => val != null);
	if (results.length >= limit) return results;

	const extraResults = await limitFilter(values, {
		fn,
		limit: limit - results.length,
		offset: offset + limit,
		nonNull,
	});

	return results.concat(extraResults);
}

let globalLoaderContext = {};

/**
* Base class that all of our models will extend
* This has few extra utilities over the Objection Model
* 1. Automatic table names
* 2. Automatic timestamps
* 3. Soft Deletes
* 4. scopes (define as static scopes = {default(builder) {}, something(builder) {}, ...})
*/
class BaseModel extends Model {
	static useLimitInFirst = true;

	/**
	 * timestamps can be true, false or an object of {createdAt, updatedAt}
	 * if true, createdAt and updatedAt columns will automatically be updated
	 * you can change column names using an object
	 *  eg. `{createdAt: 'add_time', updatedAt: 'modify_time'}`
	 * if you omit one column in the object, that column won't be touched at all
	 *  eg. if you don't want updatedAt => `timestamps = {createdAt: 'createdAt'}`
	 */
	static timestamps = true;
	static softDelete = false;
	static basePath = '';
	static dataLoaders = {};
	static get Error() {
		if (!this._Error) this._Error = customUserError(this.name);
		return this._Error;
	}

	/**
	 * this can be false or an object of {
	 * 		ttl (in ms or timestring),
	 * 		columns: [] (include only these columns while caching)
	 * 		excludeColumns: [] (exclude these columns while caching)
	 * 		maxLocalItems: max items in the local cache of redis (using an lru cache)
	 * }
	 * if this is an object, all items accessed with loadById are cached for ttl duration
	 */
	static cacheById = false;

	static createValidator() {
		return new AjvValidator({
			onCreateAjv: (ajv) => {
				// Here you can modify the `Ajv` instance.
				ajv.addFormat('url', httpUrlPattern);
			},
			options: {
				allErrors: true,
				validateSchema: false,
				ownProperties: true,
				v5: true,
			},
		});
	}

	static get timestampColumns() {
		if (!this.__timestampColumns) {
			this.timestampColumns = [];
		}

		return this.__timestampColumns;
	}

	// set the RedisCache class used internally by xorm
	static setRedisCacheClass(redisCacheClass) {
		LocalRedisCache = redisCacheClass;
		if (this._redisCachePrefix) {
			this.setRedisCacheGlobalPrefix(this._redisCachePrefix);
		}
	}

	// set global prefix for the rediscache used internally by xorm
	static setRedisCacheGlobalPrefix(prefix = 'a') {
		this._redisCachePrefix = prefix;
		LocalRedisCache.globalPrefix = prefix;
	}

	// define which columns will be converted to Date object when parsing this model
	static set timestampColumns(columns) {
		if (this.timestamps) {
			if (this.timestamps === true) {
				columns.push('createdAt');
				columns.push('updatedAt');
			}
			else {
				if (this.timestamps.createdAt) {
					columns.push(this.timestamps.createdAt);
				}
				if (this.timestamps.updatedAt) {
					columns.push(this.timestamps.updatedAt);
				}
			}
		}
		if (this.softDelete) {
			columns.push(this.softDeleteColumn);
		}

		this.__timestampColumns = _.uniq(columns);
	}

	$parseJson(json, opt) {
		json = super.$parseJson(json, opt);
		this.constructor.timestampColumns.forEach((column) => {
			if (json[column] && !(json[column] instanceof Date)) {
				json[column] = new Date(json[column]);
			}
		});

		return json;
	}

	get $cache() {
		if (!this.__cache) {
			this.__cache = new Cache();
		}

		return this.__cache;
	}

	static get cache() {
		if (!this.__cache) {
			this.__cache = new Cache();
		}

		return this.__cache;
	}

	static get idRedisCache() {
		if (!this.__idRedisCache) {
			const maxLocalItems = this.cacheById && this.cacheById.maxLocalItems;
			this.__idRedisCache = new LocalRedisCache(`xorm:${this.name}:id`, {
				maxLocalItems,
			});
		}

		return this.__idRedisCache;
	}

	static get redisCache() {
		if (!this.__redisCache) {
			this.__redisCache = new LocalRedisCache(`xorm:${this.name}`);
		}

		return this.__redisCache;
	}

	// set the default context for the dataloader used by loader functions
	static setGlobalLoaderContext(ctx) {
		globalLoaderContext = ctx;
	}

	static _getLoadePrefix() {
		if (this._loaderPrefix) return this._loaderPrefix;
		this._loaderPrefix = this.name !== this.tableName ? `${this.name}${this.tableName}` : this.name;
		return this._loaderPrefix;
	}

	/**
	 * @typedef {object} loaderOpts
	 * @property {boolean} [ignoreResults=false] ignore the results returned by the loader function
	 * 	[default false]
	 * @property {string} [mapBy='id'] map results returned by the loaderFn using this key
	 *  [default 'id']
	 * @property {boolean} [cache=false] cache the results returned by loaderFn indefinitely
	 *  [default false]
	 * @property {boolean|function} [filterKeys=true] filter the falsy keys before calling loaderFn
	 * 	can also be a function, [default true]
	 */

	/**
	 * make a loader so you can use it to batch queries which are not covered by existing loaders
	 * @param {string} loaderName
	 * @param {function} loaderFunc
	 * @param {loaderOpts} [options={}]
	 * @returns {DataLoader}
	 */
	static makeLoader(loaderName, loaderFunc, options = {}) {
		const loaderKey = `${this._getLoadePrefix()}Custom${loaderName}DataLoader`;
		if (globalLoaderContext[loaderKey]) return globalLoaderContext[loaderKey];

		const opts = Object.assign({
			ignoreResults: false,
			filterKeys: true,
			mapBy: 'id',
			cache: false,
		}, options);

		globalLoaderContext[loaderKey] = new DataLoader(async (keys) => {
			if (!keys.length) return [];

			let uniqFunc;
			if (Array.isArray(keys[0])) {
				uniqFunc = item => item.join('-');
			}

			let filteredKeys;
			if (typeof opts.filterKeys === 'function') {
				// this is for avoiding un-necessary queries where the value is 0 or null
				filteredKeys = _.uniqBy(keys.filter(opts.filterKeys), uniqFunc);
			}
			else if (opts.filterKeys) {
				filteredKeys = _.uniqBy(keys.filter(key => (key && key !== '0')), uniqFunc);
			}
			else {
				filteredKeys = keys;
			}

			let results = [];
			if (filteredKeys.length) {
				results = await loaderFunc(filteredKeys);
			}

			// since we don't need any results, we just return
			// an array of null so that dataloader doesn't complain
			if (opts.ignoreResults) {
				return _.fill(Array(keys.length), null);
			}

			if (opts.mapBy) {
				return mapResults(results, keys, opts.mapBy);
			}

			return results;
		}, {cache: opts.cache});

		return globalLoaderContext[loaderKey];
	}

	static _getLoaderCtx(options) {
		const ctx = options.ctx;
		const knex = options.knex;

		let loaderCtx;
		if (!ctx) {
			if (knex) {
				// we can't use global loader
				// we need to incorporate knex
				if (!knex._xorm_ctx) {
					knex._xorm_ctx = {};
				}

				loaderCtx = knex._xorm_ctx;
			}
			else {
				// we can use global ctx
				loaderCtx = globalLoaderContext;
			}
		}
		else if (knex) {
			if (!ctx._xorm_ctx) {
				ctx._xorm_ctx = new WeakMap();
			}

			loaderCtx = ctx._xorm_ctx.get(knex);
			if (!loaderCtx) {
				loaderCtx = {};
				ctx._xorm_ctx.set(knex, loaderCtx);
			}
		}
		else {
			loaderCtx = ctx;
		}

		return loaderCtx;
	}

	/**
	 * get the loader for a specific column name
	 * @param {string|Array<string>} columnName
	 * @param {object} options
	 * @param {object|null} options.ctx context for the dataloader [optional]
	 * @param {object|null} options.knex knex instance for this dataloader [optional]
	 * @returns {DataLoader}
	 */
	static getLoader(columnName, options = {}) {
		const knex = options.knex;

		let loaderName;
		if (Array.isArray(columnName)) {
			if (columnName.length === 1) {
				columnName = columnName[0];
			}
			else {
				loaderName = `${this._getLoadePrefix()}${columnName.join('-')}DataLoader`;
			}
		}
		if (!loaderName) {
			loaderName = `${this._getLoadePrefix()}${columnName}DataLoader`;
		}

		const cache = !!options.ctx;
		const ctx = this._getLoaderCtx(options);

		if (ctx[loaderName]) return ctx[loaderName];

		ctx[loaderName] = new DataLoader(async (keys) => {
			let uniqFunc;
			if (Array.isArray(columnName)) {
				uniqFunc = item => item.join('-');
			}

			// this is for avoiding un-necessary queries where the value is 0 or null
			const filteredKeys = _.uniqBy(keys.filter(key => (key && key !== '0')), uniqFunc);

			let results = [];
			if (filteredKeys.length) {
				if (Array.isArray(columnName)) {
					results = await this.query(knex).whereInComposite(columnName, filteredKeys);
				}
				else {
					results = await this.query(knex).whereIn(columnName, filteredKeys);
				}
			}
			return mapResults(results, keys, columnName);
		}, {cache});

		return ctx[loaderName];
	}

	/**
	 * get loader for one to many columns
	 * @param {string} columnName
	 * @param {object} options
	 * @param {any} options.modify
	 * @param {object|null} options.ctx
	 * @param {object|null} options.knex
	 * @returns {DataLoader}
	 */
	static getManyLoader(columnName, options = {}) {
		const knex = options.knex;
		const cache = !!options.ctx;
		const ctx = this._getLoaderCtx(options);

		let loaderName = `${this._getLoadePrefix()}${columnName}DataLoader`;
		if (options.modify) {
			if (_.isPlainObject(options.modify)) {
				loaderName += JSON.stringify(options.modify);
			}
			else {
				loaderName += String(options.modify);
			}
		}

		if (ctx[loaderName]) return ctx[loaderName];

		ctx[loaderName] = new DataLoader(async (keys) => {
			// this is for avoiding un-necessary queries where the value is 0 or null
			const filteredKeys = _.uniq(keys.filter(key => (key && key !== '0')));
			let results = [];
			if (filteredKeys.length) {
				const query = this.query(knex).whereIn(columnName, filteredKeys);
				if (options.modify) {
					if (_.isPlainObject(options.modify)) {
						query.where(options.modify);
					}
					else {
						query.modify(options.modify);
					}
				}
				results = await query;
			}
			return mapManyResults(results, keys, columnName);
		}, {cache});

		return ctx[loaderName];
	}

	/**
	 * @param {string} relationName
	 * @param {object} [options={}]
	 * @param {string} options.ownerCol
	 * @param {object|null} options.ctx
	 * @param {object|null} options.knex
	 * @returns {DataLoader}
	 */
	static getRelationLoader(relationName, options = {}) {
		const knex = options.knex;
		const cache = !!options.ctx;
		const ctx = this._getLoaderCtx(options);

		const loaderName = `${this._getLoadePrefix()}Rel${relationName}DataLoader`;
		if (ctx[loaderName]) return ctx[loaderName];

		ctx[loaderName] = new DataLoader(async (keys) => {
			const objs = keys.map((key) => {
				const obj = new this();
				obj[options.ownerCol || this.idColumn] = key;
				return obj;
			});

			const query = this.loadRelated(objs, relationName, undefined, knex);
			const results = await query;
			return results.map(result => result[relationName]);
		}, {cache});

		return ctx[loaderName];
	}

	static getIdLoader(options = {}) {
		return this.getLoader(this.idColumn, options);
	}

	/**
	 * load result by column, using dataloader
	 * @param {string|array} columnName can be a string or an array of strings for composite loading
	 * @param {any} columnValue can be single or an array
	 * @param {object} options object of {
	 *   ctx: context for the dataloader [optional / default null]
	 *   nonNull: only return nonNull results [default false]
	 *   limit: only return this many results [default null => return as many results as possible]
	 *   offset: in conjunction with limit [default 0]
	 *   knex: use this particular knex instance
	 * }
	 */
	static async _loadByColumn(columnName, columnValue, options = {}) {
		if (!columnValue || columnValue === '0') return null;
		if (Array.isArray(columnValue) && !columnValue.length) return [];

		let manyLoader = false;

		if (Array.isArray(columnName)) {
			// many loader in case of composite columns, eg. [a, b] in [[1,2], [3,4]]
			if (Array.isArray(columnValue[0])) {
				manyLoader = true;
			}
		}
		else if (Array.isArray(columnValue)) {
			// many loader in case of normal columns, eg. a in [1, 2, 3, 4]
			manyLoader = true;
		}

		if (!manyLoader) {
			return this.getLoader(columnName, options).load(columnValue);
		}

		if (options.nonNull) {
			columnValue = columnValue.filter(val => (val && val !== '0'));
		}
		else {
			// change falsy values to false
			// otherwise dataloader creates problems (does not accept null)
			columnValue = columnValue.map(val => val || false);
		}

		const loader = this.getLoader(columnName, options);
		return limitFilter(
			columnValue,
			{
				...options,
				fn: values => loader.loadMany(values),
			},
		);
	}

	/**
	 * load result by column, using dataloader
	 * @param {string|array} columnName can be a string or an array of strings for composite loading
	 * @param {any} columnValue can be single or an array
	 * @param {object} options object of {
	 *   ctx: context for the dataloader [optional / default null]
	 *   nonNull: only return nonNull results [default false]
	 *   limit: only return this many results [default null => return as many results as possible]
	 *   offset: in conjunction with limit [default 0]
	 *   knex: use this particular knex instance
	 * }
	 */
	static loadByColumn(columnName, columnValue, options = {}) {
		// separate loadById and loadByColumn, in case we override loadById
		if (columnName === this.idColumn) {
			return this.loadById(columnValue, options);
		}

		return this._loadByColumn(columnName, columnValue, options);
	}

	static fromJsonSimple(json) {
		if (!json) return null;
		return this.fromJson(json, {
			skipValidation: true,
			skipParseRelations: true,
		});
	}

	/**
	 * load result by id, using dataloader
	 * @param {any} id can be single or an array
	 * @param {object} options object of {
	 *   ctx: context for the dataloader [optional / default null]
	 *   nonNull: only return nonNull results [default false]
	 *   limit: only return this many results [default null => return as many results as possible]
	 *   offset: in conjunction with limit [default 0]
	 *   knex: use this particular knex instance
	 * }
	 */
	static loadById(id, options = {}) {
		if (!this.cacheById || options.knex) {
			return this._loadByColumn(this.idColumn, id, options);
		}

		const ttl = this.cacheById.ttl || '1d';
		const parse = this.fromJsonSimple.bind(this);

		const singleItem = async (idx) => {
			let item = await this._loadByColumn(this.idColumn, idx, options);
			if (!item) return null;

			if (this.cacheById.columns) {
				item = _.pick(item, this.cacheById.columns);
			}
			if (this.cacheById.excludeColumns) {
				item = _.omit(item, this.cacheById.excludeColumns);
			}

			return item;
		};

		if (Array.isArray(id)) {
			if (!id.length) return [];

			return limitFilter(
				id,
				{
					...options,
					fn: ids => Promise.map(ids, idx => (
						this.idRedisCache.getOrSet(
							String(idx),
							() => singleItem(idx),
							{ttl, parse},
						)
					)),
				}
			);
		}

		if (!id || id === '0') return null;
		return this.idRedisCache.getOrSet(
			String(id),
			() => singleItem(id),
			{ttl, parse},
		);
	}

	/**
	 * load many results for a single value
	 * @param {string} columnName
	 * @param {any} columnValue
	 * @param {object} options
	 * @param {any} options.modify
	 * @param {object|null} options.ctx
	 * @param {object|null} options.knex
	 * @returns {Array}
	 */
	static loadManyByColumn(columnName, columnValue, options = {}) {
		if (!columnValue || columnValue === '0') return null;

		if (Array.isArray(columnValue)) {
			// change falsy values to false, otherwise dataloader creates problems (does not accept null)
			columnValue = columnValue.map(val => val || false);
			return this.getManyLoader(columnName, options).loadMany(columnValue);
		}

		return this.getManyLoader(columnName, options).load(columnValue);
	}

	static deleteCacheById(id) {
		return this.idRedisCache.del(String(id));
	}

	// base path for requiring models in relations
	static setBasePath(basePath) {
		this.basePath = basePath;
	}

	static get softDeleteColumn() {
		if (_.isString(this.softDelete)) {
			return this.softDelete;
		}

		return 'deletedAt';
	}

	static get systemColumns() {
		if (!this._systemColumns) {
			const columns = [];

			// timestamps (createdAt + updatedAt handling)
			if (this.timestamps) {
				if (this.timestamps === true) {
					columns.push('createdAt');
					columns.push('updatedAt');
				}
				else {
					if (this.timestamps.createdAt) {
						columns.push(this.timestamps.createdAt);
					}
					if (this.timestamps.updatedAt) {
						columns.push(this.timestamps.updatedAt);
					}
				}
			}

			if (this.softDelete) {
				columns.push(this.softDeleteColumn);
			}

			this._systemColumns = columns;
		}

		return this._systemColumns;
	}

	static set systemColumns(columns) {
		this._systemColumns = columns;
	}

	static get tableName() {
		this._tableName = this._tableName || this.name;
		return this._tableName;
	}

	static set tableName(table) {
		this._tableName = table;
	}

	static get relationMappings() {
		if (this._relationMappings) return this._relationMappings;

		// generate relation mappings
		this._relationMappings = {};
		this.$relations();
		return this._relationMappings;
	}

	static set relationMappings(mappings) {
		this._relationMappings = mappings;
	}

	static $relations() {}

	static where(...args) {
		return this.query().where(...args);
	}

	static find(...args) {
		return this.query().find(...args);
	}

	static getFindOneResolver(options = {}) {
		return (async (root, args) => {
			if (args[this.idColumn]) {
				return this.loadById(args[this.idColumn], options);
			}

			const keys = Object.keys(args);
			if (!keys.length) return null;

			if (keys.length === 1) {
				return this.loadByColumn(keys[0], args[keys[0]], options);
			}

			const query = this.query();
			keys.forEach((key) => {
				query.where(key, args[key]);
			});

			return query.first();
		});
	}

	/**
	 * beforeResolve can be used to return a modified item to use for resolving
	 * called before resolving (using graphql) a particular item
	 * @param  {Object} options options is {args} args = arguments passed from graphql query
	 * @return {Object}      a xorm model object
	 */
	beforeResolve(args) {	// eslint-disable-line
		return this;
	}

	/**
	 * afterResolve can be used to modify the item we got from the resolver
	 * called after resolving (using graphql) a particular item
	 * @param  {Object} options options is {args, default, isDefault}
	 * 	args = graphql query args
	 * 	isDefault = true if default value is returned
	 * @return {Object}      a xorm model object
	 */
	afterResolve(args) {	// eslint-disable-line
		return this;
	}

	async loadByRelation(relationName, options = {}) {
		const relation = this.constructor.getRelation(relationName);
		if (!relation) {
			throw new Error(`relation ${relationName} is not defined in ${this.constructor.name}`);
		}

		const relatedCols = (relation.relatedProp && relation.relatedProp.cols) || [];
		const ownerCols = (relation.ownerProp && relation.ownerProp.cols) || [];

		const args = options.args || {};

		let self = this;
		if (this.beforeResolve) {
			// eslint-disable-next-line consistent-this
			self = await this.beforeResolve(options);
		}

		// Return the object if it is already fetched
		if (self[relationName] !== undefined) {
			return handleResult(self[relationName], options);
		}

		// Only pass single column relations through data loader
		if (relatedCols.length !== 1 || ownerCols.length !== 1) {
			await self.$loadRelated(relationName, undefined, options.knex);
			return handleResult(self[relationName], options);
		}

		if (
			relation instanceof Model.BelongsToOneRelation ||
			relation instanceof Model.HasOneRelation
		) {
			self[relationName] = await relation.relatedModelClass
				.loadByColumn(relatedCols[0], self[ownerCols[0]], options);

			return handleResult(self[relationName], options);
		}
		if (relation instanceof Model.HasManyRelation) {
			const modify = relation.modify;
			if (String(modify).indexOf('noop') !== -1) {
				self[relationName] = await relation.relatedModelClass
					.loadManyByColumn(relatedCols[0], self[ownerCols[0]], options);

				return handleResult(self[relationName], options);
			}

			self[relationName] = await relation.relatedModelClass
				.loadManyByColumn(relatedCols[0], self[ownerCols[0]], {
					modify,
					ctx: options.ctx,
					knex: options.knex,
				});

			return handleResult(self[relationName], options);
		}
		if (
			relation instanceof Model.ManyToManyRelation ||
			relation instanceof Model.HasOneThroughRelation
		) {
			return handleResult(
				await this.constructor.getRelationLoader(
					relationName,
					{
						ownerCol: ownerCols[0],
						ctx: options.ctx,
						knex: options.knex,
					},
				).load(self[this.constructor.idColumn]),
				args
			);
		}

		await self.$loadRelated(relationName, undefined, options.knex);
		return handleResult(self[relationName], args);
	}

	static getRelationResolver(relationName, options = {}) {
		const relation = this.getRelation(relationName);
		if (!relation) {
			throw new Error(`relation ${relationName} is not defined in ${this.name}`);
		}

		if (relation.relatedModelClass.selfRelationResolver) {
			return relation.relatedModelClass.selfRelationResolver(relation, options);
		}

		return (async (obj, args) => {
			options.args = args;
			return obj.loadByRelation(relationName, options);
		});
	}

	static getFindByIdSubResolver(propName, options = {}) {
		if (!propName) propName = `${_.camelCase(this.name)}Id`;
		return (async obj => this.loadById(obj[propName], options));
	}

	static getDeleteByIdResolver() {
		return (async (root, obj) => this.query().deleteById(obj[this.idColumn])
			.then(() => ({id: obj[this.idColumn]})));
	}

	$beforeInsert(context) {
		super.$beforeInsert(context);
		const timestamps = this.constructor.timestamps;
		if (timestamps && !context.dontTouch) {
			if (timestamps === true) {
				this.createdAt = new Date().toISOString();
				this.updatedAt = new Date().toISOString();
			}
			else {
				if (timestamps.createdAt) {
					this[timestamps.createdAt] = new Date().toISOString();
				}
				if (timestamps.updatedAt) {
					this[timestamps.updatedAt] = new Date().toISOString();
				}
			}
		}
	}

	$beforeUpdate(opt, context) {
		super.$beforeUpdate(opt, context);
		const timestamps = this.constructor.timestamps;
		if (timestamps && !context.dontTouch) {
			if (timestamps === true) {
				this.updatedAt = new Date().toISOString();
			}
			else if (timestamps.updatedAt) {
				this[timestamps.updatedAt] = new Date().toISOString();
			}
		}
	}

	$beforeDelete(context) {
		super.$beforeDelete(context);
	}

	async $afterUpdate(opts, queryContext) {
		await super.$afterUpdate(opts, queryContext);
		if (!this.constructor.cacheById) return;

		const id = queryContext.id || this.id;
		if (id) {
			await this.constructor.deleteCacheById(id);
		}
	}

	async $afterDelete(queryContext) {
		await super.$afterDelete(queryContext);
		if (!this.constructor.cacheById) return;

		const id = queryContext.id || this.id;
		if (id) {
			await this.constructor.deleteCacheById(id);
		}
	}

	static getJsonSchema() {
		// Memoize the jsonSchema but only for this class. The hasOwnProperty check
		// will fail for subclasses and the value gets recreated.
		// eslint-disable-next-line
		if (!this.hasOwnProperty('$$jsonSchema')) {
			// this.jsonSchema is often a getter that returns a new object each time. We need
			// memoize it to make sure we get the same instance each time.
			const jsonSchema = this.jsonSchema;

			if (jsonSchema && jsonSchema.properties) {
				const columns = this.systemColumns || [];
				columns.forEach((column) => {
					jsonSchema.properties[column] = {};
				});
			}

			Object.defineProperty(this, '$$jsonSchema', {
				enumerable: false,
				writable: true,
				configurable: true,
				value: jsonSchema,
			});
		}

		return this.$$jsonSchema;
	}

	static _getModelClass(model) {
		if (!_.isString(model)) return model;

		// if an all model object is given, take model from that object
		if (this.allModels && (model in this.allModels)) {
			return this.allModels[model];
		}

		// try to require model by including the model file directly
		let modelPath;
		try {
			modelPath = require.resolve(path.resolve(this.basePath, model) + '/' + model);
		}
		catch (e) {
			modelPath = require.resolve(path.resolve(this.basePath, model));
		}

		const modelClass = require(modelPath);
		return modelClass.default || modelClass;
	}

	static belongsTo(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.BelongsTo(Person) (this = Pet)
		// Pet Belongs To Person
		// This Means => Pet.personId = Person.id
		// will be accessible through Pet.person

		// Pet.person
		const name = options.name || _.camelCase(modelClass.name);
		// Person.petId
		const joinFrom = options.joinFrom || `${this.tableName}.${name}${_.upperFirst(modelClass.idColumn)}`;
		// Pet.id
		const joinTo = options.joinTo || `${modelClass.tableName}.${modelClass.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: Model.BelongsToOneRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo,
			},
		};
	}

	static hasOne(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasOne(Pet) (this = Person)
		// Person Has One Pet
		// This Means => Person.id = Pet.personId
		// will be accessible through Person.pet

		// Person.pet
		const name = options.name || _.camelCase(modelClass.name);
		// Pet.personId
		const joinFrom = options.joinFrom || `${modelClass.tableName}.${_.camelCase(this.name)}${_.upperFirst(this.idColumn)}`;
		// Pet.id
		const joinTo = options.joinTo || `${this.tableName}.${this.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: Model.HasOneRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo,
			},
		};
	}

	static hasMany(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasMany(Pet) (this = Person)
		// Person Has Many Pets
		// This Means => Pet.personId = Person.id
		// will be accessible through Person.pets

		// Person.pets
		const name = options.name || plural(_.camelCase(modelClass.name));
		// Pet.personId
		const joinFrom = options.joinFrom || `${modelClass.tableName}.${_.camelCase(this.name)}${_.upperFirst(this.idColumn)}`;
		// Person.id
		const joinTo = options.joinTo || `${this.tableName}.${this.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: Model.HasManyRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo,
			},
		};
	}

	static hasManyThrough(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasManyThrough(Pet) (this = Person)
		// Person Has Many Pets Through Some Other Table (Let's Say Pet_Person)
		// This Means => Pet_Person.personId = Person.id
		// will be accessible through Person.pets

		// Person.pets
		const name = options.name || plural(_.camelCase(modelClass.name));
		// Person.id
		const joinFrom = options.joinFrom || `${this.tableName}.${this.idColumn}`;
		// Pet.id
		const joinTo = options.joinTo || `${modelClass.tableName}.${modelClass.idColumn}`;
		const filter = options.filter || options.modify || null;

		options.through = options.through || {};

		let throughClass;
		let throughTable;

		if (options.through.model) {
			throughClass = this._getModelClass(options.through.model);
			throughTable = options.through.table || throughClass.tableName;
		}
		else {
			// PersonPetMap
			throughTable = options.through.table;
			if (!throughTable) {
				if (this.name < modelClass.name) {
					throughTable = `${this.name}${modelClass.name}Map`;
				}
				else {
					throughTable = `${modelClass.name}${this.name}Map`;
				}
			}
		}

		// PersonPetMap.personId
		const throughFrom = options.through.from || `${throughTable}.${_.camelCase(this.name)}${_.upperFirst(this.idColumn)}`;
		// PersonPetMap.petId
		const throughTo = options.through.to || `${throughTable}.${_.camelCase(modelClass.name)}${_.upperFirst(modelClass.idColumn)}`;

		const throughExtra = options.through.extra || null;
		const throughFilter = options.through.filter || null;

		this._relationMappings[name] = {
			relation: Model.ManyToManyRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo,
				through: {
					from: throughFrom,
					to: throughTo,
					modelClass: throughClass,
					extra: throughExtra,
					filter: throughFilter,
				},
			},
		};
	}
}

BaseModel.QueryBuilder = BaseQueryBuilder;
BaseModel.RelatedQueryBuilder = BaseQueryBuilder;

export default BaseModel;

export {
	limitFilter,
};
