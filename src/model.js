/* eslint-disable import/no-dynamic-require, global-require */
import path from 'path';
import _ from 'lodash';
import {Model, AjvValidator} from 'objection';
import DataLoader from 'dataloader';
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
	static timestamps = true;
	static softDelete = false;
	static Error = UserError;
	static basePath = '';
	static dataLoaders = {};

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

	static setGlobalLoaderContext(ctx) {
		globalLoaderContext = ctx;
	}

	static getLoader(columnName, ctx = null) {
		const loaderName = `${this.tableName}${columnName}DataLoader`;
		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new DataLoader(async (keys) => {
				const results = await this.query().whereIn(columnName, _.uniq(keys));
				return mapResults(results, keys, columnName);
			}, {cache});
		}

		return ctx[loaderName];
	}

	static getManyLoader(columnName, ctx = null, options = {}) {
		let loaderName = `${this.tableName}${columnName}DataLoader`;
		let cache = true;
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
				const query = this.query().whereIn(columnName, _.uniq(keys));
				if (options.modify) {
					if (_.isPlainObject(options.modify)) {
						query.where(options.modify);
					}
					else {
						query.modify(options.modify);
					}
				}
				const results = await query;
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

	static loadById(id, ctx = null) {
		if (Array.isArray(id)) {
			return this.getIdLoader(ctx).loadMany(id);
		}

		return this.getIdLoader(ctx).load(id);
	}

	static loadByColumn(columnName, columnValue, ctx = null) {
		if (Array.isArray(columnValue)) {
			return this.getLoader(columnName, ctx).loadMany(columnValue);
		}

		return this.getLoader(columnName, ctx).load(columnValue);
	}

	static loadManyByColumn(columnName, columnValue, ctx = null) {
		if (Array.isArray(columnValue)) {
			return this.getManyLoader(columnName, ctx).loadMany(columnValue);
		}

		return this.getManyLoader(columnName, ctx).load(columnValue);
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
				return this.getIdLoader(options.ctx).load(args[this.idColumn]);
			}

			const keys = Object.keys(args);
			if (!keys.length) return null;

			if (keys.length === 1) {
				return this.getLoader(keys[0], options.ctx).load(args[keys[0]]);
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
	 * @param  {Object} args arguments passed from graphql query
	 * @return {Object}      a xorm model object
	 */
	beforeResolve(args) {	// eslint-disable-line
		return this;
	}

	/**
	 * afterResolve can be used to modify the item we got from the resolver
	 * called after resolving (using graphql) a particular item
	 * @param  {Object} args arguments passed from graphql query
	 * @return {Object}      a xorm model object
	 */
	afterResolve(args) {	// eslint-disable-line
		return this;
	}

	async loadByRelation(relationName, options = {}) {
		const handleResult = (obj, args) => {
			if (!obj) return null;
			if (Array.isArray(obj)) {
				return obj.map(item => handleResult(item, args));
			}
			if (obj.afterResolve) {
				return obj.afterResolve(args);
			}
			return obj;
		};

		const relation = this.getRelation(relationName);
		if (!relation) {
			throw new Error(`relation ${relationName} is not defined in ${this.name}`);
		}

		const relatedCols = (relation.relatedProp && relation.relatedProp.cols) || [];
		const ownerCols = (relation.ownerProp && relation.ownerProp.cols) || [];

		const args = options.args || {};

		let self = this;
		if (this.beforeResolve) {
			// eslint-disable-next-line consistent-this
			self = await this.beforeResolve(args);
		}

		// Return the object if it is already fetched
		if (self[relationName] !== undefined) {
			return handleResult(self[relationName], args);
		}

		// Only pass single column relations through data loader
		if (relatedCols.length !== 1 || ownerCols.length !== 1) {
			await self.$loadRelated(relationName);
			return handleResult(self[relationName], args);
		}

		if (
			relation instanceof Model.BelongsToOneRelation ||
			relation instanceof Model.HasOneRelation
		) {
			return handleResult(
				await relation.relatedModelClass
					.getLoader(relatedCols[0])
					.load(self[ownerCols[0]]),
				args
			);
		}
		else if (relation instanceof Model.HasManyRelation) {
			const modify = relation.modify;
			if (String(modify).indexOf('noop') !== -1) {
				return handleResult(
					await relation.relatedModelClass
						.getManyLoader(relatedCols[0], options.ctx)
						.load(self[ownerCols[0]]),
					args
				);
			}

			return handleResult(
				await relation.relatedModelClass
					.getManyLoader(relatedCols[0], options.ctx, {
						modify,
					})
					.load(self[ownerCols[0]]),
				args
			);
		}
		else if (
			relation instanceof Model.ManyToManyRelation ||
			relation instanceof Model.HasOneThroughRelation
		) {
			return handleResult(
				await this.getRelationLoader(
					relationName,
					options.ctx,
					{ownerCol: ownerCols[0]},
				).load(self[this.idColumn]),
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
		return (async obj => this.getIdLoader(options.ctx).load(obj[propName]));
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
					jsonSchema.properties[column] = {type: ['datetime', 'string', 'int', 'null']};
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
