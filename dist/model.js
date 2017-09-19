'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _objection = require('objection');

var _dataloader = require('dataloader');

var _dataloader2 = _interopRequireDefault(_dataloader);

var _query_builder = require('./query_builder');

var _query_builder2 = _interopRequireDefault(_query_builder);

var _utils = require('./utils');

var _user_error = require('./user_error');

var _user_error2 = _interopRequireDefault(_user_error);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; } /* eslint-disable import/no-dynamic-require, global-require */


const httpUrlPattern = new RegExp('^(https?:\\/\\/)?' + // protocol
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
class BaseModel extends _objection.Model {

	static createValidator() {
		return new _objection.AjvValidator({
			onCreateAjv: ajv => {
				// Here you can modify the `Ajv` instance.
				ajv.addFormat('url', httpUrlPattern);
			},
			options: {
				allErrors: true,
				validateSchema: false,
				ownProperties: true,
				v5: true
			}
		});
	}

	static setGlobalLoaderContext(ctx) {
		globalLoaderContext = ctx;
	}

	static getLoader(columnName, ctx = null) {
		var _this = this;

		const loaderName = `${this.tableName}${columnName}DataLoader`;
		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new _dataloader2.default((() => {
				var _ref = _asyncToGenerator(function* (keys) {
					const results = yield _this.query().whereIn(columnName, _lodash2.default.uniq(keys));
					return mapResults(results, keys, columnName);
				});

				return function (_x) {
					return _ref.apply(this, arguments);
				};
			})(), { cache });
		}

		return ctx[loaderName];
	}

	static getManyLoader(columnName, ctx = null, options = {}) {
		var _this2 = this;

		let loaderName = `${this.tableName}${columnName}DataLoader`;
		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (options.modify) {
			if (_lodash2.default.isPlainObject(options.modify)) {
				loaderName += JSON.stringify(options.modify);
			} else {
				loaderName += String(options.modify);
			}
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new _dataloader2.default((() => {
				var _ref2 = _asyncToGenerator(function* (keys) {
					const query = _this2.query().whereIn(columnName, _lodash2.default.uniq(keys));
					if (options.modify) {
						if (_lodash2.default.isPlainObject(options.modify)) {
							query.where(options.modify);
						} else {
							query.modify(options.modify);
						}
					}
					const results = yield query;
					return mapManyResults(results, keys, columnName);
				});

				return function (_x2) {
					return _ref2.apply(this, arguments);
				};
			})(), { cache });
		}

		return ctx[loaderName];
	}

	static getRelationLoader(relationName, ctx = null, options = {}) {
		var _this3 = this;

		const loaderName = `${this.tableName}Rel${relationName}DataLoader`;
		let cache = true;
		if (!ctx) {
			ctx = globalLoaderContext;
			cache = false;
		}

		if (!ctx[loaderName]) {
			ctx[loaderName] = new _dataloader2.default((() => {
				var _ref3 = _asyncToGenerator(function* (keys) {
					const objs = keys.map(function (key) {
						const obj = new _this3();
						obj[options.ownerCol || _this3.idColumn] = key;
						return obj;
					});

					const query = _this3.loadRelated(objs, relationName);
					const results = yield query;
					return results.map(function (result) {
						return result[relationName];
					});
				});

				return function (_x3) {
					return _ref3.apply(this, arguments);
				};
			})(), { cache });
		}

		return ctx[loaderName];
	}

	static getIdLoader(ctx = null) {
		return this.getLoader(this.idColumn, ctx);
	}

	// base path for requiring models in relations
	static setBasePath(basePath) {
		this.basePath = basePath;
	}

	static get softDeleteColumn() {
		if (_lodash2.default.isString(this.softDelete)) {
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
		var _this4 = this;

		return (() => {
			var _ref4 = _asyncToGenerator(function* (root, args) {
				if (args[_this4.idColumn]) {
					return _this4.getIdLoader(options.ctx).load(args[_this4.idColumn]);
				}

				const keys = Object.keys(args);
				if (!keys.length) return null;

				if (keys.length === 1) {
					return _this4.getLoader(keys[0], options.ctx).load(args[keys[0]]);
				}

				const query = _this4.query();
				keys.forEach(function (key) {
					query.where(key, args[key]);
				});

				return query.first();
			});

			return function (_x4, _x5) {
				return _ref4.apply(this, arguments);
			};
		})();
	}

	static getRelationResolver(relationName, options = {}) {
		var _this5 = this;

		return (() => {
			var _ref5 = _asyncToGenerator(function* (obj) {
				const relation = _this5.getRelation(relationName);
				if (!relation) {
					throw new Error(`relation ${relationName} is not defined in ${_this5.name}`);
				}

				if (relation instanceof _objection.Model.BelongsToOneRelation || relation instanceof _objection.Model.HasOneRelation) {
					if (relation.relatedCol.length === 1 && relation.ownerCol.length === 1) {
						return relation.relatedModelClass.getLoader(relation.relatedCol[0]).load(obj[relation.ownerCol[0]]);
					}
				} else if (relation instanceof _objection.Model.HasManyRelation) {
					const modify = relation.modify;
					if (relation.relatedCol.length === 1 && relation.ownerCol.length === 1) {
						if (String(modify).indexOf('noop') !== -1) {
							return relation.relatedModelClass.getManyLoader(relation.relatedCol[0], options.ctx).load(obj[relation.ownerCol[0]]);
						}

						return relation.relatedModelClass.getManyLoader(relation.relatedCol[0], options.ctx, {
							modify
						}).load(obj[relation.ownerCol[0]]);
					}
				} else if (relation instanceof _objection.Model.ManyToManyRelation || relation instanceof _objection.Model.HasOneThroughRelation) {
					if (relation.relatedCol.length === 1 && relation.ownerCol.length === 1) {
						return _this5.getRelationLoader(relationName, options.ctx, { ownerCol: relation.ownerCol }).load(obj[_this5.idColumn]);
					}
				}

				if (obj[relationName] !== undefined) return obj[relationName];
				yield obj.$loadRelated(relationName);
				return obj[relationName] || null;
			});

			return function (_x6) {
				return _ref5.apply(this, arguments);
			};
		})();
	}

	static getFindByIdSubResolver(propName, options = {}) {
		var _this6 = this;

		if (!propName) propName = `${_lodash2.default.camelCase(this.name)}Id`;
		return (() => {
			var _ref6 = _asyncToGenerator(function* (obj) {
				return _this6.getIdLoader(options.ctx).load(obj[propName]);
			});

			return function (_x7) {
				return _ref6.apply(this, arguments);
			};
		})();
	}

	static getDeleteByIdResolver() {
		var _this7 = this;

		return (() => {
			var _ref7 = _asyncToGenerator(function* (root, obj) {
				return _this7.query().deleteById(obj[_this7.idColumn]).then(function () {
					return { id: obj[_this7.idColumn] };
				});
			});

			return function (_x8, _x9) {
				return _ref7.apply(this, arguments);
			};
		})();
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
				columns.forEach(column => {
					jsonSchema.properties[column] = { type: ['datetime', 'string', 'int', 'null'] };
				});
			}

			Object.defineProperty(this, '$$jsonSchema', {
				enumerable: false,
				writable: true,
				configurable: true,
				value: jsonSchema
			});
		}

		return this.$$jsonSchema;
	}

	static _getModelClass(model) {
		if (!_lodash2.default.isString(model)) return model;
		const modelClass = require(_path2.default.resolve(this.basePath, model));
		return modelClass.default || modelClass;
	}

	static belongsTo(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.BelongsTo(Person) (this = Pet)
		// Pet Belongs To Person
		// This Means => Pet.id = Person.petId
		// will be accessible through Pet.person

		// Pet.person
		const name = options.name || _lodash2.default.camelCase(modelClass.name);
		// Person.petId
		const joinFrom = options.joinFrom || `${modelClass.tableName}.${_lodash2.default.camelCase(this.name)}${_lodash2.default.upperFirst(this.idColumn)}`;
		// Pet.id
		const joinTo = options.joinTo || `${this.tableName}.${this.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: _objection.Model.BelongsToOneRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo
			}
		};
	}

	static hasOne(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasOne(Pet) (this = Person)
		// Person Has One Pet
		// This Means => Person.petId = Pet.id
		// will be accessible through Person.pet

		// Person.pet
		const name = options.name || _lodash2.default.camelCase(modelClass.name);
		// Person.petId
		const joinFrom = options.joinFrom || `${this.tableName}.${_lodash2.default.camelCase(modelClass.name)}${_lodash2.default.upperFirst(modelClass.idColumn)}`;
		// Pet.id
		const joinTo = options.joinTo || `${modelClass.tableName}.${modelClass.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: _objection.Model.HasOneRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo
			}
		};
	}

	static hasMany(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasMany(Pet) (this = Person)
		// Person Has Many Pets
		// This Means => Pet.personId = Person.id
		// will be accessible through Person.pets

		// Person.pets
		const name = options.name || (0, _utils.plural)(_lodash2.default.camelCase(modelClass.name));
		// Pet.personId
		const joinFrom = options.joinFrom || `${modelClass.tableName}.${_lodash2.default.camelCase(this.name)}${_lodash2.default.upperFirst(this.idColumn)}`;
		// Person.id
		const joinTo = options.joinTo || `${this.tableName}.${this.idColumn}`;
		const filter = options.filter || options.modify || null;

		this._relationMappings[name] = {
			relation: _objection.Model.HasManyRelation,
			modelClass,
			filter,
			join: {
				from: joinFrom,
				to: joinTo
			}
		};
	}

	static hasManyThrough(model, options = {}) {
		const modelClass = this._getModelClass(model);

		// this.HasManyThrough(Pet) (this = Person)
		// Person Has Many Pets Through Some Other Table (Let's Say Pet_Person)
		// This Means => Pet_Person.personId = Person.id
		// will be accessible through Person.pets

		// Person.pets
		const name = options.name || (0, _utils.plural)(_lodash2.default.camelCase(modelClass.name));
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
		} else {
			// PersonPetMap
			throughTable = options.through.table;
			if (!throughTable) {
				if (this.name < modelClass.name) {
					throughTable = `${this.name}${modelClass.name}Map`;
				} else {
					throughTable = `${modelClass.name}${this.name}Map`;
				}
			}
		}

		// PersonPetMap.personId
		const throughFrom = options.through.from || `${throughTable}.${_lodash2.default.camelCase(this.name)}${_lodash2.default.upperFirst(this.idColumn)}`;
		// PersonPetMap.petId
		const throughTo = options.through.to || `${throughTable}.${_lodash2.default.camelCase(modelClass.name)}${_lodash2.default.upperFirst(modelClass.idColumn)}`;

		const throughExtra = options.through.extra || null;
		const throughFilter = options.through.filter || null;

		this._relationMappings[name] = {
			relation: _objection.Model.ManyToManyRelation,
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
					filter: throughFilter
				}
			}
		};
	}
}

BaseModel.timestamps = true;
BaseModel.softDelete = false;
BaseModel.Error = _user_error2.default;
BaseModel.basePath = '';
BaseModel.dataLoaders = {};
BaseModel.QueryBuilder = _query_builder2.default;
BaseModel.RelatedQueryBuilder = _query_builder2.default;

exports.default = BaseModel;