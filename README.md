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

### save and saveAndFetch
`save`: inserts a model if the id column does not exist, otherwise updates it.  
`saveAndFetch`: saves the model and then fetches it.  

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
