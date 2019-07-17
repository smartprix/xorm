import _ from 'lodash';
import {QueryBuilder} from 'objection';

// Patch knexjs to include upcoming where statements in bracket (for softDelete hook)
import './knex_patch';

class BaseQueryBuilder extends QueryBuilder {
	constructor(modelClass) {
		super(modelClass);

		this._handleSoftDelete();
		this._handleScopes();
	}

	loaderContext(ctx) {
		this.context().loaderContext = ctx;
	}

	loaderCtx(ctx) {
		this.context().loaderContext = ctx;
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
			// modelClass has a generateId function, use that
			if (this.modelClass().generateId) {
				fields.id = this.modelClass().generateId();
			}
			return this.insert(fields);
		}

		const patchFields = _.assign({}, fields);
		delete patchFields[id];

		const context = {[id]: fields[id]};
		return this.mergeContext(context).patch(patchFields).where(id, fields[id]);
	}

	saveAndFetch(fields) {
		const id = this.modelClass().idColumn;
		if (!(id in fields)) {
			// modelClass has a generateId function, use that
			if (this.modelClass().generateId) {
				fields.id = this.modelClass().generateId();
			}
			return this.insertAndFetch(fields);
		}

		const patchFields = _.assign({}, fields);
		delete patchFields[id];

		const context = {[id]: fields[id]};
		return this.mergeContext(context).patchAndFetchById(fields[id], patchFields);
	}

	updateById(id, fields) {
		const idColumn = this.modelClass().idColumn;
		const context = {[idColumn]: id};
		return this.mergeContext(context).update(fields).whereComposite(idColumn, id);
	}

	patchById(id, fields) {
		const idColumn = this.modelClass().idColumn;
		const context = {[idColumn]: id};
		return this.mergeContext(context).patch(fields).whereComposite(idColumn, id);
	}

	deleteById(id) {
		const idColumn = this.modelClass().idColumn;
		const context = {[idColumn]: id};
		return this.mergeContext(context).delete().whereComposite(idColumn, id);
	}

	whereByOr(obj) {
		this.where((q) => {
			_.forEach(obj, (value, key) => {
				q.orWhere(key, value);
			});
		});

		return this;
	}

	whereByAnd(obj) {
		this.orWhere((q) => {
			_.forEach(obj, (value, key) => {
				q.where(key, value);
			});
		});

		return this;
	}

	/**
	 * order the items by position in the array given (of column)
	 * this is mostly useful in whereIn queries where you need ordered results
	 * ```js
	 * const ids = [1, 4, 3, 5, 8];
	 * const query = Model.query().whereIn('id', ids).orderByArrayPos('id', ids);
	 * ```
	 * @param  {string} column array contains values of which column
	 * @param  {Array<any>} values values of the columns
	 */
	orderByArrayPos(column, values) {
		// eslint-disable-next-line
		this.runAfter(async (models) => {
			return _.orderBy(models, model => values.indexOf(model[column]));
		});

		return this;
	}

	orderByArrayPosition(column, array) {
		return this.orderByArrayPos(column, array);
	}

	/**
	 * this is equivalent to `this.where(column, values).orderByArrayPos(column, values)`
	 * use this for returning results ordered in the way you gave them
	 */
	whereInOrdered(column, values) {
		this.whereIn(column, values).orderByArrayPos(column, values);
		return this;
	}

	andWhereInOrdered(column, values) {
		return this.whereInOrdered(column, values);
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
	} */

	_handleScopes() {
		if (!this.modelClass().scopes) return;

		const defaultScope = this.modelClass().scopes.default;
		if (defaultScope) {
			this.onBuild((builder) => {
				if (!builder.context().withoutScope) {
					defaultScope(builder);
				}
			});
		}

		_.forEach(this.modelClass().scopes, (func, name) => {
			this[name] = func;
		});
	}

	withoutScope(withoutScope = true) {
		this.context().withoutScope = withoutScope;
		return this;
	}

	_handleSoftDelete() {
		const model = this.modelClass();
		if (!model.softDelete) return;

		this.onBuildKnex((knex, builder) => {
			if (
				// don't add soft delete condition to partial queries (inside functions)
				builder._isPartialQuery ||
				!builder.isFind() ||
				builder.context().withTrashed
			) return;

			const softDeleteColumn = `${model.tableName}.${model.softDeleteColumn}`;

			// add the deletedAt statement
			if (builder.context().onlyTrashed) {
				knex.where(q => q.whereNotNull(softDeleteColumn));
			}
			else {
				knex.where(q => q.whereNull(softDeleteColumn));
			}

			// push the _ww statement which wraps up the upcoming where condition in brackets
			// this is done in knex_patch.js
			knex._statements.push({
				grouping: 'where',
				type: '_ww',
			});
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
		return this.dontTouch()
			.patch({
				[this.modelClass().softDeleteColumn]: new Date().toISOString(),
			});
	}

	trash() {
		return this.softDelete();
	}

	forceDelete() {
		return super.delete();
	}

	restore() {
		return this.dontTouch()
			.withTrashed()
			.patch({
				[this.modelClass().softDeleteColumn]: null,
			});
	}

	touch() {
		return this.patch({
			updatedAt: new Date().toISOString(),
		});
	}

	dontTouch() {
		this.context().dontTouch = true;
		return this;
	}
}

export default BaseQueryBuilder;
