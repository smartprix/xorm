'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _objection = require('objection');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class BaseQueryBuilder extends _objection.QueryBuilder {
	constructor(modelClass) {
		super(modelClass);

		this._handleSoftDelete();
		this._handleScopes();
	}

	find(...args) {
		if (args.length === 1) {
			return this.findById(...args);
		}

		return this.where(...args);
	}

	save(fields) {
		const id = this.modelClass().idColumn;
		if (!(id in fields)) {
			return this.insert(fields);
		}

		const patchFields = _lodash2.default.assign({}, fields);
		delete patchFields[id];

		return this.patch(patchFields).where(id, fields[id]);
	}

	saveAndFetch(fields) {
		const id = this.modelClass().idColumn;
		if (!(id in fields)) {
			return this.insertAndFetch(fields);
		}

		const patchFields = _lodash2.default.assign({}, fields);
		delete patchFields[id];

		return this.patchAndFetchById(fields[id], patchFields);
	}

	whereByOr(obj) {
		this.where(q => {
			_lodash2.default.forEach(obj, (value, key) => {
				q.orWhere(key, value);
			});
		});

		return this;
	}

	whereByAnd(obj) {
		this.orWhere(q => {
			_lodash2.default.forEach(obj, (value, key) => {
				q.where(key, value);
			});
		});

		return this;
	}

	/* limitGroup(groupKey, limit, offset = 0) {
 	// TODO: Incomplete
 	// See Here: https://softonsofa.com/tweaking-eloquent-relations-how-to-get-n-related-models-per-parent/
 	// Also: https://gist.github.com/juavidn/80a8b5cc755330120b690a82469fbfe2
 		const tableName = this.modelClass().tableName;
 		this.from(`(SELECT @rank := 0, @group := 0) AS vars, ${tableName}`);
 	this.select('`' + tableName + '`.*');
 		const groupAlias = '__group_12369';
 	const rankAlias = '__rank_12369';
 	this.select(`
 		@rank := IF(@group = ${groupKey}, @rank+1, 1) as ${rankAlias},
 		@group := {$group} as ${groupAlias}
 	`);
 }*/

	_handleScopes() {
		if (!this.modelClass().scopes) return;

		const defaultScope = this.modelClass().scopes.default;
		if (defaultScope) {
			this.onBuild(builder => {
				if (!builder.context().withoutScope) {
					defaultScope(builder);
				}
			});
		}

		_lodash2.default.forEach(this.modelClass().scopes, (func, name) => {
			this[name] = func;
		});
	}

	withoutScope(withoutScope = true) {
		this.context().withoutScope = withoutScope;
		return this;
	}

	/*
  * Wraps the where condition till now into braces
  * so builder.where('a', 'b').orWhere('c', 'd').wrapWhere().where('e', 'f');
  * becomes "WHERE (a = 'b' OR c = 'd') AND e = 'f'"
  */
	wrapWhere() {
		const whereOperations = _lodash2.default.remove(this._operations, method => /where/i.test(method.name));

		if (whereOperations.length > 1) {
			this.where(q => {
				whereOperations.forEach(operation => {
					q[operation.name](...operation.args);
				});
			});
		} else if (whereOperations.length === 1) {
			this._operations.push(whereOperations[0]);
		}

		return this;
	}

	_handleSoftDelete() {
		const model = this.modelClass();
		if (!model.softDelete) return;

		const softDeleteColumn = `${model.tableName}.${model.softDeleteColumn}`;

		this.onBuild(builder => {
			builder.wrapWhere();

			if (builder.context().onlyTrashed) {
				builder.where(q => q.whereNotNull(softDeleteColumn));
			} else if (!builder.context().withTrashed) {
				builder.where(q => q.whereNull(softDeleteColumn));
			}
		});
	}

	withTrashed(withTrashed = true) {
		this.context().withTrashed = withTrashed;
		return this;
	}

	onlyTrashed(onlyTrashed = true) {
		this.context().onlyTrashed = onlyTrashed;
		return this;
	}

	delete() {
		if (!this.modelClass().softDelete) {
			return super.delete();
		}

		return this.softDelete();
	}

	softDelete() {
		return this.dontTouch().patch({
			[this.modelClass().softDeleteColumn]: new Date().toISOString()
		});
	}

	trash() {
		return this.softDelete();
	}

	forceDelete() {
		return super.delete();
	}

	restore() {
		return this.dontTouch().withTrashed().patch({
			[this.modelClass().softDeleteColumn]: null
		});
	}

	touch() {
		return this.patch({
			updatedAt: new Date().toISOString()
		});
	}

	dontTouch() {
		this.context().dontTouch = true;
		return this;
	}
}

exports.default = BaseQueryBuilder;