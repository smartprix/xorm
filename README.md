<a href="https://www.npmjs.com/package/xorm"><img src="https://img.shields.io/npm/v/xorm.svg" alt="Version"></a>
<a href="https://www.npmjs.com/package/xorm"><img src="https://img.shields.io/npm/dm/xorm.svg" alt="Downloads"></a>
<a href="https://www.npmjs.com/package/xorm"><img src="https://img.shields.io/npm/l/xorm.svg" alt="License"></a>
<a href="https://david-dm.org/smartprix/xorm"><img src="https://david-dm.org/smartprix/xorm/status.svg" alt="Dependencies"></a>
<a href="https://david-dm.org/smartprix/xorm?type=dev"><img src="https://david-dm.org/smartprix/xorm/dev-status.svg" alt="Dev Dependencies"></a>
<a href="https://david-dm.org/smartprix/xorm?type=peer"><img src="https://david-dm.org/smartprix/xorm/peer-status.svg" alt="Peer Dependencies"></a>

## xorm
NodeJS ORM based on ObjectionJS with some extra utilities

ObjectionJS documentation: http://vincit.github.io/objection.js/
ObjectionJS Repo: https://github.com/Vincit/objection.js/

## Extra Features
Xorm adds some more functionalities in ObjectionJS.

### Default Table Name
You don't need to give tableName in your model. By default the tableName = name of the model.
```js
// eg. instead of writing this
class Person extends Model {
	static tableName = 'Person';
	...
}

// you can write
class Person extends Model {
	...
}
```

### Automatic timestamps
Every model has automatically managed timestamps (`createdAt` and `updatedAt`), which gets updated whenever the model is created or updated.
For disabling the timestamps you can do `static timestamps = false;` in your model.

`timestamps` can be true, false or an object of `{createdAt, updatedAt}`. If true, `createdAt` and `updatedAt` columns will automatically be updated.

You can change column names using an object.
```js
static timestamps = {createdAt: 'add_time', updatedAt: 'modify_time'};
```

If you omit one column in the object, that column won't be touched at all
eg. if you don't want updatedAt:
```js
static timestamps = {createdAt: 'createdAt'};
```

For dealing with timestamp few extra methods are added:
`touch`: update `updatedAt` of the model to current time.
`dontTouch`: don't update the timestamps after executing the query

### Soft Delete
For turning on soft delete you can do `static softDelete = true;` (make sure your schema has `deletedAt` column as a nullable timestamp)
So whenever you delete a model, it won't actually be deleted from the database, instead the value of `deletedAt` column will be set to current time.
When retriving, it will automatically take care of the deleted models (they won't come in results).

For dealing with softDelete few extra methods are added:
`delete`: soft delete or delete a model (depending on whether softDelete is true or false)
`trash`: soft delete a model (you won't usually need this method, just use `delete`)
`withTrashed`: get all models (whether they are soft deleted or not)
`onlyTrashed`: only get soft deleted models.
`restore`: restore (undelete) a soft deleted model.
`forceDelete`: actually delete a model from the database

If you want to use some other column name instead of `deletedAt` you can do `static softDelete = 'deleted_at';`

```js
class Person extends Model {
	// Turn on soft delete
	static softDelete = true;
}

// soft delete
Person.query().where('id', 1).delete();
// restore a soft deleted model
Person.query().where('id', 1).restore();
// get all persons (except deleted ones)
Person.query();
// get all persons (including deleted ones)
Person.query().withTrashed();
// get only deleted persons
Person.query().onlyTrashed();
// delete a person from the database
Person.query().forceDelete();
```

### Timestamp Columns
You can set `timestampColumns` property of the model class to convert some columns to `Date` automatically while making objects from `fromJson` or `insert`.

`createdAt`, `updatedAt` and `deletedAt` are automatically added to `timestampColumns`

```js
class Person extends Model {
	static timestampColumns = ['lastLoginTime', 'bannedAt'];
}
```

### GraphQL Helpers
There are some graphql helper functions defined. You should use them because they
take care of batching and optimizations.

#### `getFindOneResolver()`
returns a resolver for GraphQL query where you query the item by a single unique field

`category(id: ID, name: String): Category`
`Query: { category: Category.getFindOneResolver() }`

#### `getRelationResolver(relationName, options = {})`
Returns a resolver for a relation that is defined in the model.

You can override the default related resolver by defining `selfRelationResolver(relation, options)` in the related model.

`type Store { id: ID!, name: String!, category: Category }`
`Store: { category: Store.getRelationResolver('category') }`

Options can be:
```js
// options can be
// default: default value to return if the relation returns null, can be a function
```

#### `getDeleteByIdResolver()`
returns a resolver for GraphQL delete mutation

`deleteCategory(id: ID) { DeletedItem }`
`Mutation: { deleteCategory: Category.getDeleteByIdResolver() }`

#### `getFindByIdSubResolver(propName)`
returns a resolver for finding model by id. It optionally takes a propName
argument which denotes the name of the field containing the id.

`type Store { id: ID!, name: String!, category: Category }`
`Store: { category: Category.getFindByIdSubResolver() }`
`Store: { category: Category.getFindByIdSubResolver('categoryId') }`

#### `beforeResolve(options)` and `afterResolve(options)`
These functions are used to modify (or any other action like logging) the result of resolver before
and after the item has been resolved.

```js
afterResolve(options) {
	const params = {options.args};
	if (params) {
		this.url = `${this.url}?${params}`;
	}
	return this;
}

// options will be
// args: graphql query arguments (it'll be automatically filled by xorm)
// isDefault: whether the query returned null and default value is used
```

#### `getIdLoader(ctx)`
returns a Data Loader for batching and caching purposes. You can optionally give it a context to
return different loaders for different contexts.

```js
// get store by id 1
Store.getIdLoader().load(1);

// get multiple stores
Store.getIdLoader().loadMany([1, 2, 3]);
```

**Note:** `findById` is modified to use loader automatically. You should use `findById` wherever
possible to get the benefits of batching.

```js
Store.query().findById(1);

// optionally give it a context
Store.query().loaderContext(ctx).findById(1);
```

#### `getLoader(columnName, ctx)`
returns a Data Loader for batching and caching purposes. You can optionally give it a context to
return different loaders for different contexts. It can return a loader for any arbitary column.
Use this when the column returns only one result (unique)

```js
// get user by email
User.getLoader('email').load('abc@xyz.com');

// get multiple users
User.getLoader('email').loadMany(['abc@xyz.com', 'def@xyz.com']);
```

#### `getManyLoader(columnName, ctx)`
returns a Data Loader for batching and caching purposes. You can optionally give it a context to
return different loaders for different contexts. It can return a loader for any arbitary column.
Use this when the column returns many results (non-unique)

```js
// get user by email
User.getManyLoader('country').load('IN');

// get multiple users
User.getManyLoader('country').loadMany(['IN', 'US']);
```

#### `loadById(id, options = {limit, offset, nonNull, ctx, knex})`
Short for `getIdLoader(options).load(id)`

#### `loadByColumn(columnName, columnValue, options = {limit, offset, nonNull, ctx, knex})`
Short for `getLoader(columnName, options).load(columnValue)`

#### NOTE
Both `loadById` and `loadByColumn` can accept options which can an object of

```js
{
	ctx: null, // context for the dataloader [optional / default null]
	nonNull: false, // only return nonNull results [default false]
	limit: null, // only return this many results [default null => return as many results as possible]
	offset: 0, // in conjunction with limit [default 0]
}
```

#### `loadManyByColumn(columnName, columnValue, options = {ctx, knex, modify})`
Short for `getManyLoader(columnName, options).load(columnValue)`

#### `loadByRelation(relationName, options = {ctx, knex, args})`
You can use this to get a related model. This will automatically take care of batching. `args` can be used to pass arguments to `beforeResolve` and `afterResolve`

```js
const product = await Product.query().findById(1);
const category = await product.loadByRelation('category');
```

#### `makeLoader(loaderName, loaderFn, options = {})`
You can use this function to make a loader if the query is not covered by existing loaders.

```js
class Product extends Model {
	async setIndexed() {
		const loader = Product.makeLoader('setIndexed', async (keys) => {
			return Product.query().update('indexed', 1).whereIn('id', keys);
		}, {ignoreResults: true});

		return loader.load(this.id);
	}
}

// options can be
// ignoreResults: [default false] ignore the results returned by the loader function
// mapBy: [default 'id'] map results returned by the loaderFn using this key
// cache: [default false] cache the results returned by loaderFn indefinitely
// filterKeys: [default true] filter the falsy keys before calling loaderFn, filterKeys can also be a function
```

### `save` and `saveAndFetch`
`save`: inserts a model if the id column does not exist, otherwise updates it.
`saveAndFetch`: saves the model and then fetches it.

### `updateById`, `patchById` and `deleteById`
`updateById(id, fields)`: updates the model by id\
`patchById(id, fields)`: patches the model by id\
`deleteById(id)`: deletes the model by id\
All three merge the id property into the query context

### `whereByOr(obj)`
creates an and (or - or - or) condition

```js
q.where('id', 1).whereByOr({votes: 100, user: 'smpx'})
// where `id` = 1 and (`votes` = 100 or `user` = 'smpx')
```

### `whereByAnd(obj)`
creates an or (and - and - and) condition

```js
q.where('id', 1).whereByAnd({votes: 100, user: 'smpx'})
// where `id` = 1 or (`votes` = 100 and `user` = 'smpx')
```

### `orderByArrayPos(column, items)`
order the items by position in the array given (of column).
this is mostly useful in whereIn queries where you need ordered results.

```js
const ids = [1, 4, 3, 5, 8];
q.whereIn('id', ids).orderByArrayPos('id', ids);
```

### `whereInOrdered(column, values)`
equivalent to `this.where(column, values).orderByArrayPos(column, values)`.
use this for returning results ordered in the way you gave them

```js
const ids = [1, 4, 3, 5, 8];
q.whereInOrdered('id', ids)
```

### find Method
`find`: find is like where except if only a single argument is given, it treats the argument as an id.

```js
// all three are equivalent
Person.query().find(1);
Person.query().where('id', 1);
Person.query().findById(1);

// both are equivalent
Person.query().find('name', 'Hitesh');
Person.query().where('name', 'Hitesh');
```

### where and find methods on model
Instead of doing `Person.query().where()` you can do `Person.where()`
Instead of doing `Person.query().find()` you can do `Person.find()`

### `$cache`, `cache` and `redisCache`
You can use these properties to cache things.
`$cache` is for instance and `cache` is for the Model
`redisCache` is cache backed by Redis for the Model

```js
class Person extends Model {
	static getAll() {
		return this.redisCache.getOrSet('all', () => Person.query());
	}

	async getChildren() {
		return this.$cache.getOrSet('children', () => this.$loadRelated('children'));
	}
}
```

### `cacheById`
You can set `cacheById` if you want to cache items by their id.
cache will be used when you use `loadById` function.
Items are automatically removed from cache on `$afterUpdate` and `$afterDelete`
`cacheById` is an object of `{ttl, columns, excludeColumns, maxLocalItems}`

```js
class Person extends Model {
	static cacheById = {
		ttl: '3h',
	};
}

// items are now being cached by their id for 3 hours
// the following will result in only 2 DB queries
await Person.loadById(1);
await Person.loadById(1);
await Person.loadById([1, 2]);
await Person.loadById(2);
```

### Easier Relationships
You can define all your relationships in the `$relations` method.
#### Methods for defining relations
**belongsTo(model, options)**
**hasOne(model, options)**
**hasMany(model, options)**
**hasManyThrough(model, options)**

options are totally optional. they can be:
```
name: name of the relationship (by default name of the model in camelCase)
joinFrom: join field from (by default ModelTableName.camelCasedModelNameId)
joinTo: join field to (by default ModelTableName.id)
filter: apply this filter to the model
through: {
	model: if there is a model for the through table
    table: tableName of the table to join through
    from: join through from
    to: join through to
    filter: filter to apply on the join table
    extra: extra fields to select from the through table
}
```

```js
class Pet extends Model {
	static $relations() {
    	this.hasOne(Pet);
        this.hasMany(Toy, {name: 'toys'});
        this.belongsTo(Person);
        this.hasManyThrough(Pet, {
        	name: 'siblings',
			through: {
            	table: 'Pet_Siblings',
                from: 'pet_id',
                to: 'sibling_id',
            },
        });
    }
}
```

Model can be a model object, or an absolute path to a model class. It can also be a relative path if you set the basePath of all models using `Model.setBasePath(path)`

### UserError class
If you throw any error using UserError class, it'll be sent to the API client (if you're using graphql & gqutils). Otherwise errors are simply sent as `Server Error`. You can also throw an object using it.

```js
import {UserError} from 'xorm';

async function saveStore(store) {
	if (!store.name) {
		throw new UserError({
			name: 'Name is required',
		});
	}
}

// Alternatively instead of importing UserError you can simply throw Model.Error
async function saveStore(store) {
	if (!store.name) {
		throw new Store.Error({
			name: 'Name is required',
		});
	}
}
```
