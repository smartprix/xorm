/* eslint-disable */
import {expect} from 'chai';
import {Model} from '../src/index';
import './global';
import {KnexUtils} from './lib/models';
let knex;
before(async function () {
	this.timeout(30000);
	knex = await KnexUtils.refreshDb('test');
	Model.knex(knex);
});

const testModels = ['Store', 'Brand', 'Category']
testModels.forEach(testModel => {
	let tests;
	let model;
	before(function () {
		tests = require('./testData/' + testModel).default;
		model = require('./lib/' + testModel + '/index').default;
	});
	describe(testModel, () => {
		it('getLoader testing', () => {
			const result = model.getLoader('id');
			expect(typeof result).to.equal(tests.getLoader.outputType);
			expect(Object.keys(result)).to.deep.equal(tests.getLoader.keys);
		});
		it('cache testing', () => {
			const result = model.cache;
			expect(typeof result).to.equal(tests.cache.outputType);
			expect(Object.keys(result)).to.deep.equal(tests.cache.keys);
		});
		it('redisCache testing', () => {
			const result = model.redisCache;
			expect(typeof result).to.equal(tests.redisCache.outputType);
			expect(Object.keys(result)).to.deep.equal(tests.redisCache.keys);
		});
		it('getManyLoader testing', () => {
			const result = model.getManyLoader();
			expect(typeof result).to.equal(tests.getManyLoader.outputType);
			expect(Object.keys(result)).to.deep.equal(tests.getManyLoader.keys);
		});
		it('getRelationLoader testing', () => {
			const result = model.getRelationLoader();
			expect(typeof result).to.equal(tests.getRelationLoader.outputType);
			expect(Object.keys(result)).to.deep.equal(tests.getRelationLoader.keys);
		});
		it('softDeleteColumn testing', () => {
			const result = model.softDeleteColumn;
			expect(result).to.deep.equal(tests.softDeleteColumn.output);
		});
		it('systemColumns testing', () => {
			const result = model.systemColumns;
			expect(result).to.deep.equal(tests.systemColumns.output);
		});
		it('getJsonSchema testing', () => {
			const result = model.getJsonSchema();
			expect(result).to.deep.equal(tests.getJsonSchema.output);
		});
		it('tableName testing', () => {
			const result = model.tableName;
			expect(result).to.deep.equal(tests.tableName.output);
		});
	})
})
