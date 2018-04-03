const path = require('path');
const KnexUtils = require('../../test/lib/KnexUtils');

const dataPath = path.join(__dirname, '../dummy');
exports.seed = async function (knex) {
	// fix autoincrement on postgres
	KnexUtils.setKnex(knex);
	await KnexUtils.seedFolder(dataPath);
};
