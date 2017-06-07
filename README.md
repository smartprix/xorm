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

### GraphQL Helpers
There are some graphql helper functions defined. You should use them because they
take care of batching and optimizations.

#### `getFindOneResolver()`
returns a resolver for GraphQL query where you query the item by a single unique field

`category(id: ID, name: String): Category`  
`Query: { category: Category.getFindOneResolver() }`

#### `getRelationResolver(relationName)`
returns a resolver for a relation that is defined in the model.

`type Store { id: ID!, name: String!, category: Category }` 
`Query: { Store: { category: Store.getRelationResolver('category') } }` 

#### `getDeleteByIdResolver()`
returns a resolver for GraphQL delete mutation

`deleteCategory(id: ID) { DeletedItem }`  
`Mutation: { deleteCategory: Category.getDeleteByIdResolver() }`  

#### `getFindByIdSubResolver(propName)`
returns a resolver for finding model by id. It optionally takes a propName
argument which denotes the name of the field containing the id.

`type Store { id: ID!, name: String!, category: Category }`  
`Query: { Store: { category: Category.getFindByIdSubResolver() } }`  
`Query: { Store: { category: Category.getFindByIdSubResolver('categoryId') } }`  

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

### `save` and `saveAndFetch`
`save`: inserts a model if the id column does not exist, otherwise updates it.  
`saveAndFetch`: saves the model and then fetches it. 

### `wrapWhere`
Wraps the where condition till now into braces  
so `builder.where('a', 'b').orWhere('c', 'd').wrapWhere().where('e', 'f');` becomes `"WHERE (a = 'b' OR c = 'd') AND e = 'f'"`

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
