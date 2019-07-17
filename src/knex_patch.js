/**
 * Patch knexjs to include upcoming where statements in bracket
 * This is needed in softDelete
 * In SoftDelete when adding the softdelete condition,
 * we need to make sure rest of the where condition is also wrapped up
 * example, this changes
 * `where ("deletedAt" is null) and "id" = 3 or "slug" = "sam"
 * to
 * `where ("deletedAt" is null) and ("id" = 3 or "slug" = "sam")
*/
const QueryCompiler = require('knex/lib/query/compiler');
const knexHelpers = require('knex/lib/helpers');

QueryCompiler.prototype.where = function () {
	const wheres = this.grouped.where;
	if (!wheres) return;
	let sql = '';
	let i = -1;
	let endStr = '';
	let noBool = true;
	while (++i < wheres.length) {
		const stmt = wheres[i];
		if (stmt.type === '_ww') {
			// if there's only one condition left, then no need to add brackets
			if (i >= wheres.length - 2) continue;
			if (sql) {
				sql += ' and (';
			}
			else {
				sql += '(';
			}
			noBool = true;
			endStr = ')';
			continue;
		}
		if (
			Object.prototype.hasOwnProperty.call(stmt, 'value') &&
			knexHelpers.containsUndefined(stmt.value)
		) {
			this._undefinedInWhereClause = true;
		}
		const val = this[stmt.type](stmt);
		if (val) {
			if (noBool) {
				sql += val;
				noBool = false;
			}
			else {
				sql += ` ${stmt.bool} ${val}`;
			}
		}
	}

	// eslint-disable-next-line
	return sql ? 'where ' + sql + endStr : '';
};
