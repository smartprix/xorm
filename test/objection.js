import {Model} from '../src/index';
import Knex from 'knex';
import path from 'path';

import knexfile from '../knexfile';

const knexConfig = knexfile[process.env.NODE_ENV] || knexfile.development;
const knex = Knex(knexConfig);

Model.knex(knex);
Model.setBasePath(path.join(__dirname, 'lib'));
Model.pickJsonSchemaProperties = false;

export default Model;
export {
	Model,
	knex,
};
