exports.up = function (knex) {
	return knex.schema.createTableIfNotExists('Store', (table) => {
		table.increments('id').primary();
		table.string('name').notNullable();
		table.string('shortName').notNullable();
		table.text('link').notNullable();
		table.string('domain').notNullable();
		table.string('status').notNullable();
		table.integer('rating').nullable();
		table.timestamp('createdAt').nullable();
		table.timestamp('updatedAt').nullable();
		table.timestamp('deletedAt').nullable();
	});
};

exports.down = function (knex) {
	return knex.schema.dropTableIfExists('Store');
};
