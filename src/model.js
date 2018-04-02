/* eslint-disable import/no-dynamic-require, global-require */
import path from 'path';
import _ from 'lodash';
import {Model, AjvValidator} from 'objection';
import DataLoader from 'dataloader';
import {Cache, RedisCache} from 'sm-utils';
import BaseQueryBuilder from './query_builder';
import {plural} from './utils';
import UserError from './user_error';

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
	static timestamps = true;
	static softDelete = false;
	static Error = UserError;
	static basePath = '';
	static dataLoaders = {};

	/**
	 * this can be false or an object of {ttl (in ms or timestring)}
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

	static set timestampColumns(columns) {
		if (this.timestamps) {
			columns.push('createdAt');
			columns.push('updatedAt');
		}
		if (this.softDelete) {
			columns.push(this.softDeleteColumn);
		}

		this.__timestampColumns = _.uniq(columns);
	}

	$parseJson(json, opt) {
		json = super.$parseJson(json, opt);
		this.timestampColumns.forEach((column) => {
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

	static get redisCache() {
		if (!this.__redisCache) {
			this.__redisCache = new RedisCache(`xorm:${this.name}`);
		}

		return this.__redisCache;
	}

	static setGlobalLoaderContext(ctx) {
		globalLoaderContext = ctx;
	}

	// make a loader so you can use it to batch queries which are not covered by existing loaders
	static makeLoader(loaderName, loaderFunc, options = {}) {
		const loaderKey = `${this.tableName}Custom${loaderName}DataLoader`;
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

	static getLoader(columnName, ctx = null) {
		let loaderName;

		if (Array.isArray(columnName)) {
			if (columnName.length === 1) {
				columnName = columnName[0];
			}
			else {
				loaderName = `${this.tableName}${columnName.join('-')}DataLoader`;
			}
		}

		if (!loaderName) {
			loaderName = `${this.tableName}${columnName}DataLoader`;
		}

		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (!ctx[loaderName]) {
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
						results = await this.query().whereInComposite(columnName, filteredKeys);
					}
					else {
						results = await this.query().whereIn(columnName, filteredKeys);
					}
				}
				return mapResults(results, keys, columnName);
			}, {cache});
		}

		return ctx[loaderName];
	}

	static getManyLoader(columnName, options = {}) {
		let loaderName = `${this.tableName}${columnName}DataLoader`;
		let cache = true;
		let ctx = options.ctx;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (options.modify) {
			if (_.isPlainObject(options.modify)) {
				loaderName += JSON.stringify(options.modify);
			}
			else {
				loaderName += String(options.modify);
			}
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new DataLoader(async (keys) => {
				// this is for avoiding un-necessary queries where the value is 0 or null
				const filteredKeys = _.uniq(keys.filter(key => (key && key !== '0')));
				let results = [];
				if (filteredKeys.length) {
					const query = this.query().whereIn(columnName, filteredKeys);
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
		}

		return ctx[loaderName];
	}

	static getRelationLoader(relationName, ctx = null, options = {}) {
		const loaderName = `${this.tableName}Rel${relationName}DataLoader`;
		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new DataLoader(async (keys) => {
				const objs = keys.map((key) => {
					const obj = new this();
					obj[options.ownerCol || this.idColumn] = key;
					return obj;
				});

				const query = this.loadRelated(objs, relationName);
				const results = await query;
				return results.map(result => result[relationName]);
			}, {cache});
		}

		return ctx[loaderName];
	}

	static getIdLoader(ctx = null) {
		return this.getLoader(this.idColumn, ctx);
	}

	static _loadByColumn(columnName, columnValue, ctx = null) {
		if (!columnValue || columnValue === '0') return null;

		if (Array.isArray(columnName)) {
			if (Array.isArray(columnValue[0])) {
				return this.getLoader(columnName, ctx).loadMany(columnValue);
			}
		}
		else if (Array.isArray(columnValue)) {
			// change falsy values to false, otherwise dataloader creates problems (does not accept null)
			columnValue = columnValue.map(val => val || false);
			return this.getLoader(columnName, ctx).loadMany(columnValue);
		}

		return this.getLoader(columnName, ctx).load(columnValue);
	}

	static loadByColumn(columnName, columnValue, ctx = null) {
		// separate loadById and loadByColumn, in case we override loadById
		if (columnName === this.idColumn) {
			return this.loadById(columnValue, ctx);
		}

		return this._loadByColumn(columnName, columnValue, ctx);
	}

	static loadById(id, ctx = null) {
		if (!this.cacheById) {
			return this._loadByColumn(this.idColumn, id, ctx);
		}

		const ttl = this.cacheById.ttl || '1d';
		const parse = this.fromJson.bind(this);

		if (Array.isArray(id)) {
			if (!id.length) return [];

			return Promise.map(id, idx => (
				this.redisCache.getOrSet(
					`id:${idx}`,
					() => this._loadByColumn(this.idColumn, idx, ctx),
					{ttl, parse},
				)
			));
		}

		if (!id || id === '0') return null;
		return this.redisCache.getOrSet(
			`id:${id}`,
			() => this._loadByColumn(this.idColumn, id, ctx),
			{ttl, parse},
		);
	}

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
		return this.redisCache.del(`id:${id}`);
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
			if (this.timestamps) {
				columns.push('createdAt');
				columns.push('updatedAt');
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
				return this.loadById(args[this.idColumn], options.ctx);
			}

			const keys = Object.keys(args);
			if (!keys.length) return null;

			if (keys.length === 1) {
				return this.loadByColumn(keys[0], args[keys[0]], options.ctx);
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
			throw new Error(`relation ${relationName} is not defined in ${this.name}`);
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
			await self.$loadRelated(relationName);
			return handleResult(self[relationName], options);
		}

		if (
			relation instanceof Model.BelongsToOneRelation ||
			relation instanceof Model.HasOneRelation
		) {
			self[relationName] = await relation.relatedModelClass
				.loadByColumn(relatedCols[0], self[ownerCols[0]], options.ctx);

			return handleResult(self[relationName], options);
		}
		else if (relation instanceof Model.HasManyRelation) {
			const modify = relation.modify;
			if (String(modify).indexOf('noop') !== -1) {
				self[relationName] = await relation.relatedModelClass
					.loadManyByColumn(relatedCols[0], self[ownerCols[0]], options.ctx);

				return handleResult(self[relationName], options);
			}

			self[relationName] = await relation.relatedModelClass
				.loadManyByColumn(relatedCols[0], self[ownerCols[0]], {ctx: options.ctx, modify});

			return handleResult(self[relationName], options);
		}
		else if (
			relation instanceof Model.ManyToManyRelation ||
			relation instanceof Model.HasOneThroughRelation
		) {
			return handleResult(
				await this.constructor.getRelationLoader(
					relationName,
					options.ctx,
					{ownerCol: ownerCols[0]},
				).load(self[this.constructor.idColumn]),
				args
			);
		}

		await self.$loadRelated(relationName);
		return handleResult(self[relationName], args);
	}

	static getRelationResolver(relationName, options = {}) {
		return (async (obj, args) => {
			options.args = args;
			return obj.loadByRelation(relationName, options);
		});
	}

	static getFindByIdSubResolver(propName, options = {}) {
		if (!propName) propName = `${_.camelCase(this.name)}Id`;
		return (async obj => this.loadById(obj[propName], options.ctx));
	}

	static getDeleteByIdResolver() {
		return (async (root, obj) => this.query().deleteById(obj[this.idColumn])
			.then(() => ({id: obj[this.idColumn]})));
	}

	$beforeInsert(context) {
		super.$beforeInsert(context);
		if (this.constructor.timestamps && !context.dontTouch) {
			this.createdAt = new Date().toISOString();
			this.updatedAt = new Date().toISOString();
		}
	}

	$beforeUpdate(opt, context) {
		super.$beforeUpdate(opt, context);
		if (this.constructor.timestamps && !context.dontTouch) {
			this.updatedAt = new Date().toISOString();
		}
	}

	$beforeDelete(context) {
		super.$beforeDelete(context);
	}

	async $afterUpdate(opts, queryContext) {
		await super.$afterUpdate(opts, queryContext);
		if (!this.cacheById) return;

		const id = queryContext.id || this.id;
		if (id) {
			await this.constructor.deleteCacheById(id);
		}
	}

	async $afterDelete(queryContext) {
		await super.$afterDelete(queryContext);
		if (!this.cacheById) return;

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
