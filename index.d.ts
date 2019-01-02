import {
	Model as ObjectionModel,
	QueryBuilder as ObjectionQueryBuilder,
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
	Executable,
	PartialUpdate,
	QueryBuilderYieldingCount,
	QueryBuilderYieldingOne,
	QueryBuilderYieldingOneOrNone,
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
		model: string;
		data: any;
	}
	
	class QueryBuilder<QM extends ObjectionModel, RM = QM[], RV = RM> extends ObjectionQueryBuilder<QM, RM, RV> {
		loaderContext(ctx: object|null): void;
		loaderCtx(ctx: object|null): void;
		find(...args: any[]): QueryBuilderYieldingOneOrNone<QM>;
		save(fields: Partial<QM>): QueryBuilderYieldingCount<QM, RM>;
		saveAndFetch<QM extends Model>(fields: object): QueryBuilderYieldingOne<QM>;
		updateById(id: any, fields: PartialUpdate<QM>): QueryBuilderYieldingCount<QM, RM>;
		patchById(id: any, fields: PartialUpdate<QM>): QueryBuilderYieldingCount<QM, RM>;
		whereByOr(obj: Partial<QM>): QueryBuilder<QM, RM, RV>;
		whereByAnd(obj: Partial<QM>): QueryBuilder<QM, RM, RV>;
		/**
		 * order the items by position in the array given (of column)
	 	 * this is mostly useful in whereIn queries where you need ordered results
		 * @param column values of which column 
		 * @param values values of the columns
		 */
		orderByArrayPos(column: string, values: Array<any>): QueryBuilder<QM, RM, RV>;
		orderByArrayPosition(column: string, values: Array<any>): QueryBuilder<QM, RM, RV>;
		/**
		 * this is equivalent to `this.where(column, values).orderByArrayPos(column, values)`
		 * use this for returning results ordered in the way you gave them
		 */
		whereInOrdered(column: string, values: Array<any>): QueryBuilder<QM, RM, RV>;
		andWhereInOrdered(column: string, values: Array<any>): QueryBuilder<QM, RM, RV>;
		withoutScope(withoutScope?: boolean): QueryBuilder<QM, RM, RV>;
		/*
		 * Wraps the where condition till now into braces
		 * so builder.where('a', 'b').orWhere('c', 'd').wrapWhere().where('e', 'f');
		 * becomes "WHERE (a = 'b' OR c = 'd') AND e = 'f'"
		 */
		wrapWhere(): QueryBuilder<QM, RM, RV>;
		withTrashed(withTrashed?: boolean): QueryBuilder<QM, RM, RV>;
		onlyTrashed(onlyTrashed?: boolean): QueryBuilder<QM, RM, RV>;
		softDelete(): QueryBuilderYieldingCount<QM, RM>;
		trash(): QueryBuilderYieldingCount<QM, RM>;
		forceDelete(): QueryBuilderYieldingCount<QM, RM>;
		restore(): QueryBuilderYieldingCount<QM, RM>;
		touch(): QueryBuilderYieldingCount<QM, RM>;
		dontTouch(): QueryBuilder<QM, RM, RV>;
	}

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

	class Model extends ObjectionModel {
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
		
		static loadByColumn<QM extends Model>(columnName: string|Array<string>, columnValue: any, options?: object): Promise<QM|null>;
		static loadByColumn<QM extends Model>(columnName: string|Array<string>, columnValue: Array<any>, options?: object): Promise<Array<QM|null>>;
		static fromJsonSimple<QM extends Model>(json: object): QM;
		static loadById<QM extends Model>(this: Constructor<QM>, id: any, options?: object): Promise<QM|null>;
		static loadById<QM extends Model>(this: Constructor<QM>, id: Array<any>, options?: object): Promise<Array<QM|null>>;
		static loadManyByColumn<QM extends Model>(columnName: string, columnValue: any, options?: object): Promise<QM|null>;
		static loadManyByColumn<QM extends Model>(columnName: string, columnValue: Array<any>, options?: object): Promise<Array<QM|null>>;
		
		static $relations(): void;
		static belongsTo(model: string|typeof Model, options?: object): void;
		static hasOne(model: string|typeof Model, options?: object): void;
		static hasMany(model: string|typeof Model, options?: object): void;
		static hasManyThrough(model: string|typeof Model, options?: object): void;
		
		static QueryBuilder: typeof QueryBuilder;
		static where<QM extends Model>(
			this: Constructor<QM>,
			...args: any[],
		): QueryBuilder<QM, QM[]>;
		static find<QM extends Model>(
			this: Constructor<QM>,
			...args: any[],
		): QueryBuilder<QM>;

		static RelatedQueryBuilder: typeof QueryBuilder;
		loadByRelation(relationName: string, options?: object): Promise<Model>;

		static getFindOneResolver<QM extends Model>(options?: object): (root: object, args: object) => QueryBuilderYieldingOneOrNone<QM>;
		static getRelationResolver(relationName:string, options?: object): (root: object, args: object) => Promise<Model|null|Array<Model|null>>;
		static getFindByIdSubResolver<QM extends Model>(propName: string, options?: object): (obj: any) => Promise<QM|null>;
		static getDeleteByIdResolver(): (root: object, obj: object) => Promise<{id: any}>;

		$parseJson(json: Pojo, opt?: ModelOptions): Pojo;
		static getJsonSchema(): JsonSchema;
	}
}