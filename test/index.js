import {cfg} from 'sm-utils';
import {graphqlKoa, graphiqlKoa} from 'graphql-server-koa';
import {formatError} from 'gqutils';

import Koa from 'koa';
import Route from 'koa-router';
import bodyParser from 'koa-body';
import views from 'koa-views';
import staticCache from 'koa-static-cache';

import './global';
import {schema} from './graphql';
// import {Request} from './lib/models';
// import installRoutes from './routes';

const app = new Koa();
const route = Route();

app.use(staticCache('./static', {
	maxAge: 30 * 24 * 60 * 60,			// 30 days
	gzip: true,							// enable compression
	prefix: '/static',					// serve at this path
	dynamic: true,						// dynamically reload files which are not cached
}));

app.use(views('./static/dist/basic', {
	map: {
		html: 'nunjucks',
	},
}));

app.use(bodyParser({
	multipart: true,
}));
// app.use(Request.middleware());

// installRoutes(app);

route.get('/', async (ctx) => {
	await ctx.render('index');
});

route.post('/api', graphqlKoa(ctx => ({
	schema: schema.admin,
	formatError,
	context: ctx,
})));

route.get('/graphiql', graphiqlKoa({
	endpointURL: '/api',
}));

app.use(route.routes());
app.use(route.allowedMethods());

function runServer() {
	const port = cfg('port');

	return new Promise((resolve) => {
		const server = app.listen(port, () => {
			const address = server.address();
			const url = `http://${address.address}:${address.port}`;
			console.log(`Server listening on ${url}`);

			resolve(url);
		});
	});
}

if (require.main === module) {
	runServer();
}

module.exports = runServer;
