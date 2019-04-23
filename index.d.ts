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
	Transaction,
} from 'objection';
import * as Knex from 'knex';
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
		saveAndFetch(fields: Partial<QM>): QueryBuilderYieldingOne<QM>;
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
		orderByArrayPos(column: string, values: any[]): QueryBuilder<QM, RM, RV>;
		orderByArrayPosition(column: string, values: any[]): QueryBuilder<QM, RM, RV>;
		/**
		 * this is equivalent to `this.where(column, values).orderByArrayPos(column, values)`
		 * use this for returning results ordered in the way you gave them
		 */
		whereInOrdered(column: string, values: any[]): QueryBuilder<QM, RM, RV>;
		andWhereInOrdered(column: string, values: any[]): QueryBuilder<QM, RM, RV>;
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

	interface makeLoaderOpts {
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

	/**
	 * limi, offset, nonNull are only applicable if ids/values is an array
	 */
	interface loaderOptions {
		/** context for the dataloader [optional / default null] **/
		ctx?: {[key: string]: any};
		/** use this particular knex instance **/
		knex?: Knex;
	}

	interface loadByOptions extends loaderOptions {
		/** only return this many results [default null => return as many results as possible] **/
		limit?: number;
		/** in conjunction with limit [default 0] **/
		offset?: number;
	}

	interface loadByOptionsNull extends loadByOptions {
		/** only return nonNull results [default false] **/
		nonNull?: false;
	}

	interface loadByOptionsNonNull extends loadByOptions {
		/** only return nonNull results [default false] **/
		nonNull: true;
	}

	interface loadManyOptions extends loaderOptions{
		modify?: any;
	}

	interface relationOptions {
		/** name of the relationship (by default name of the model in camelCase) **/
		name?: string;
		/** join field from (by default ModelTableName.camelCasedModelNameId) **/
		joinFrom?: string;
		/** join field to (by default ModelTableName.id) **/
		joinTo?: string;
		/** apply this filter to the model **/
		filter?: string;
		modify?: any;
	}

	interface relationThrough {
		/** if there is a model for the through table **/
		model?: string;
		/** tableName of the table to join through **/
		table?: string;
		/** join through from **/
		from?: string;
		/** join through to **/
		to?: string;
		/** filter to apply on the join table **/
		filter?: string;
		/** extra fields to select from the through table **/
		extra?: string;
	}

	interface resolverOptions extends loaderOptions {
		args: {[key: string]: any};
		default: ((args: any) => Promise<any>) | any;
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
		static timestamps: boolean | {createdAt?: string, updatedAt?: string};
		static timestampColumns: string[];
		static softDelete: boolean;
		static softDeleteColumn: string;
		static systemColumns: string[];
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
		static cacheById: boolean | {ttl: number | string, columns: string[], excludedColumns: string[], maxLocalItems: number};
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
		
		static dataLoaders: {[key: string]: DataLoader<any, any>};
		static setGlobalLoaderContext(ctx: object): void;
		static makeLoader(loaderName: string, loaderFunc: (keys: any[]) => Promise<any[]>, options: makeLoaderOpts): DataLoader<any, any>;
		static getLoader(columnName: string|string[], options?: loaderOptions): DataLoader<any, any>;
		static getManyLoader(columnName: string, options?: loadManyOptions): DataLoader<any, any>;
		static getRelationLoader(relationName:string, options?: loaderOptions & {ownerCol?: string}): DataLoader<any, any>;
		static getIdLoader(options?: loaderOptions): DataLoader<any, any>;
		
		static fromJsonSimple<QM extends Model>(json: object): QM;

		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string, columnValue: T[], options?: loadByOptionsNull): Promise<(QM|null)[]>;
		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string, columnValue: T[], options?: loadByOptionsNonNull): Promise<QM[]>;
		// limit, offset doesn't apply to non array overloads
		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string, columnValue: T, options?: loaderOptions): Promise<QM|null>;
		// Multiple columns
		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string[], columnValue: T[][], options?: loadByOptionsNull): Promise<(QM|null)[]>;
		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string[], columnValue: T[][], options?: loadByOptionsNonNull): Promise<QM[]>;
		// limit, offset doesn't apply to non array overloads
		static loadByColumn<QM extends Model, T>(this: Constructor<QM>, columnName: string[], columnValue: T[], options?: loaderOptions): Promise<QM|null>;

		static loadById<QM extends Model, T>(this: Constructor<QM>, id: T[], options?: loadByOptionsNull): Promise<Array<QM|null>>;
		static loadById<QM extends Model, T>(this: Constructor<QM>, id: T[], options?: loadByOptionsNonNull): Promise<Array<QM>>;
		// limit, offset doesn't apply to non array overloads
		static loadById<QM extends Model, T>(this: Constructor<QM>, id: T, options?: loaderOptions): Promise<QM|null>;

		static loadManyByColumn<QM extends Model, T>(columnName: string, columnValue: T[], options?: loadManyOptions): Promise<Array<QM|null>>;
		static loadManyByColumn<QM extends Model, T>(columnName: string, columnValue: T, options?: loadManyOptions): Promise<QM|null>;
		
		static $relations(): void;
		static belongsTo(model: string|typeof Model, options?: relationOptions): void;
		static hasOne(model: string|typeof Model, options?: relationOptions): void;
		static hasMany(model: string|typeof Model, options?: relationOptions): void;
		static hasManyThrough(model: string|typeof Model, options?: relationOptions & {through?: relationThrough}): void;
		
		static QueryBuilder: typeof QueryBuilder;
		static where<QM extends Model>(
			this: Constructor<QM>,
			...args: any[],
		): QueryBuilder<QM, QM[]>;
		static find<QM extends Model>(
			this: Constructor<QM>,
			...args: any[],
		): QueryBuilder<QM>;
		static query<QM extends ObjectionModel>(
			this: Constructor<QM>,
			trxOrKnex?: Transaction | Knex,
		): QueryBuilder<QM>;

		static RelatedQueryBuilder: typeof QueryBuilder;

		/**
		 * beforeResolve can be used to return a modified item to use for resolving
		 * called before resolving (using graphql) a particular item
		 */
		beforeResolve(options: resolverOptions): Promise<Model>;
		/**
		 * afterResolve can be used to modify the item we got from the resolver
		 * called after resolving (using graphql) a particular item
		 */
		afterResolve(options: resolverOptions & {isDefault?: true}): Promise<Model>;
		loadByRelation(relationName: string, options?: resolverOptions): Promise<Model>;

		static getRelationResolver(relationName:string, options?: resolverOptions): (root: object, args: object) => Promise<Model|null|Array<Model|null>>;
		static getFindOneResolver<QM extends Model>(options?: loadByOptions): (root: object, args: object) => QueryBuilderYieldingOneOrNone<QM>;
		static getFindByIdSubResolver<QM extends Model>(propName: string, options?: loadByOptions): (root: any) => Promise<QM|null>;
		static getDeleteByIdResolver(): (root: object, args: object) => Promise<{id: any}>;

		$parseJson(json: Pojo, opt?: ModelOptions): Pojo;
		$query<QM extends ObjectionModel>(this: QM, trxOrKnex?: Transaction | Knex): QueryBuilder<QM, QM>;

		static getJsonSchema(): JsonSchema;
	}

	function limitFilter<T, X>(values: T[], options: {limit?: number, offset?: number, nonNull: true, fn: (vals: T[]) => Promise<X[]>}): Promise<X[]>
	function limitFilter<T, X>(values: T[], options: {limit?: number, offset?: number, nonNull?: boolean, fn: (vals: T[]) => Promise<X[]>}): Promise<(X | null)[]>
	function limitFilter<T, X = T>(values: T[], options?: {limit?: number, offset?: number, nonNull?: boolean}): Promise<X[]>
	// Non Promise overloads
	function limitFilter<T, X>(values: T[], options: {limit?: number, offset?: number, nonNull: true, fn: (vals: T[]) => X[]}): Promise<X[]>
	function limitFilter<T, X>(values: T[], options: {limit?: number, offset?: number, nonNull?: boolean, fn: (vals: T[]) => X[]}): Promise<(X | null)[]>
}