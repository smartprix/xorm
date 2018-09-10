import {
	Model as BaseModel,
	QueryBuilder as BaseQueryBuilder,
	Pojo,
	ModelOptions,
	JsonSchema,
	Constructor,
	ValidationError as ValidationErrorType,
	Validator as ValidatorType,
	AjvValidator as AjvValidatorType,
	transaction as transactionType,
	compose as composeType,
	mixin as mixinType,
	ref as refType,
	lit as litType,
	raw as rawType,
	snakeCaseMappers as snakeCaseMappersType,
	knexSnakeCaseMappers as knexSnakeCaseMappersType,
} from 'objection';
import { RedisCache, Cache } from 'sm-utils';
import * as DataLoader from 'dataloader';

declare module 'xorm' {
	const ValidationError : typeof ValidationErrorType;
	const Validator : typeof ValidatorType;
	const AjvValidator : typeof AjvValidatorType;
	const transaction : typeof transactionType;
	const compose : typeof composeType;
	const mixin : typeof mixinType;
	const ref : typeof refType;
	const lit : typeof litType;
	const raw : typeof rawType;
	const snakeCaseMappers : typeof snakeCaseMappersType;
	const knexSnakeCaseMappers : typeof knexSnakeCaseMappersType;

	class UserError extends Error {
		constructor(message : any);
	}
	
	// class QueryBuilder<T extends Model, RM = T[], RV = RM> extends BaseQueryBuilder<T, RM, RV> {
	// 	loaderContext(ctx: object|null): void;
	// 	loaderCtx(ctx: object|null): void;
	// 	findById(id: any): T;
	// 	throwIfNotFound(): QueryBuilder<T, RM>;
	// }

	interface loaderOpts {
		/**
		 * ignore the results returned by the loader function
	     * [default false]
		 */
		ignoreResults?: boolean;
		/**
		 * map results returned by the loaderFn using this key
	 	 * [default 'id']
		 */
		mapBy?: string;
		/**
		 * cache the results returned by loaderFn indefinitely
	 	 * [default false]
		 */
		cache?: boolean;
		/**
		 * filter the falsy keys before calling loaderFn
	 	 * can also be a function, [default true]
		 */
		filterKeys?: boolean | ((keys: any) => boolean);
	}

	class Model extends BaseModel {
		static useLimitInFirst: boolean;
		/**
		 * timestamps can be true, false or an object of {createdAt, updatedAt}
		 * if true, createdAt and updatedAt columns will automatically be updated
		 * you can change column names using an object
		 *  eg. `{createdAt: 'add_time', updatedAt: 'modify_time'}`
		 * if you omit one column in the object, that column won't be touched at all
		 *  eg. if you don't want updatedAt => `timestamps = {createdAt: 'createdAt'}`
		 */
		static timestamps: boolean;
		static timestampColumns: Array<string>;
		static softDelete: boolean;
		static softDeleteColumn: string;
		static systemColumns: Array<string>;
		static tableName: string;
		
		static basePath: string;
		static setBasePath(basePath: string): void;
		
		static Error: typeof UserError;
		static createValidator(): AjvValidatorType;
		
		
		/**
		 * this can be false or an object of {
		 * 		ttl (in ms or timestring),
		 * 		columns: [] (include only these columns while caching)
		 * 		excludeColumns: [] (exclude these columns while caching)
		 * 		maxLocalItems: max items in the local cache of redis (using an lru cache)
		 * }
		 * if this is an object, all items accessed with loadById are cached for ttl duration
		 */
		static cacheById: boolean;
		/**
		 * @param prefix default value: 'a'
		 */
		static setRedisCacheGlobalPrefix(prefix?: string): void;
		static setRedisCacheClass(redisCacheClass: typeof RedisCache): void;
		static idRedisCache: RedisCache;
		static redisCache: RedisCache;
		static deleteCacheById(id: string|number): void;
		
		static cache: Cache;
		$cache: Cache;
		
		static dataLoaders: object;
		static setGlobalLoaderContext(ctx: object): void;
		static makeLoader(loaderName: string, loaderFunc: (keys: Array<any>) => Promise<Array<any>>, options: loaderOpts): DataLoader<any, any>;
		static getLoader(columnName: string|Array<string>, ctx?: object): DataLoader<any, any>;
		static getManyLoader(columnName: string, options?: object): DataLoader<any, any>;
		static getRelationLoader(relationName:string, ctx?: object, options?: object): DataLoader<any, any>;
		static getIdLoader(ctx?: object): DataLoader<any, any>;
		
		static loadByColumn<T extends Model>(columnName: string|Array<string>, columnValue: any, options?: object): Promise<T|null>;
		static loadByColumn<T extends Model>(columnName: string|Array<string>, columnValue: Array<any>, options?: object): Promise<Array<T|null>>;
		static fromJsonSimple<T extends Model>(json: object): T;
		static loadById<T extends Model>(this: Constructor<T>, id: any, options?: object): Promise<T|null>;
		static loadById<T extends Model>(this: Constructor<T>, id: Array<any>, options?: object): Promise<Array<T|null>>;
		static loadManyByColumn<T extends Model>(columnName: string, columnValue: any, options?: object): Promise<T|null>;
		static loadManyByColumn<T extends Model>(columnName: string, columnValue: Array<any>, options?: object): Promise<Array<T|null>>;
		
		static $relations(): void;
		static belongsTo(model: string|typeof Model, options?: object): void;
		static hasOne(model: string|typeof Model, options?: object): void;
		static hasMany(model: string|typeof Model, options?: object): void;
		static hasManyThrough(model: string|typeof Model, options?: object): void;
		
		static QueryBuilder: typeof BaseQueryBuilder;
		static where<T extends Model>(
			this: Constructor<T>,
			...args: any[],
		): BaseQueryBuilder<T, T[]>;
		static find<QM extends Model>(
			this: Constructor<QM>,
			...args: any[],
		): BaseQueryBuilder<QM>;

		static RelatedQueryBuilder: typeof BaseQueryBuilder;
		loadByRelation(relationName: string, options?: object): Promise<Model>;

		static getFindOneResolver<T extends Model>(options?: object): (root: object, args: object) => Promise<T|null>;
		static getRelationResolver(relationName:string, options?: object): (root: object, args: object) => Promise<Model|null|Array<Model|null>>;
		static getFindByIdSubResolver<T extends Model>(propName: string, options?: object): (obj: any) => Promise<T|null>;
		static getDeleteByIdResolver(): (root: object, obj: object) => Promise<{id: any}>;

		$parseJson(json: Pojo, opt?: ModelOptions): Pojo;
		static getJsonSchema(): JsonSchema;
	}
}