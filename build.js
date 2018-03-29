// const smWebpack = require('sm-webpack-config');

const KnexUtils = require('./src/KnexUtils');

const command = process.argv[2] || 'default';
const env = process.env.NODE_ENV || 'development';

// const basicConfig = {
// 	sourcePath: 'res/basic',
// 	destPath: 'static/dist/basic',
// 	publicUrl: '/static/dist/basic',
// 	devServerPort: 3001,
// 	appPort: 3000,
// };
//
// const adminConfig = {
// 	sourcePath: 'res/admin',
// 	destPath: 'static/dist/admin',
// 	publicUrl: '/static/dist/admin',
// 	devServerPort: 3002,
// 	appPort: 3000,
// };

// if (command === 'default' || command === 'run-basic') {
// 	smWebpack.runDevServer({config: basicConfig}).then(() => {
// 		console.log('Running Dev Server (Basic)!');
// 	});
// }
// else if (command === 'run-admin') {
// 	smWebpack.runDevServer({config: adminConfig}).then(() => {
// 		console.log('Running Dev Server (Admin)!');
// 	});
// }
// else if (command === 'build') {
// 	Promise.all([
// 		smWebpack.runProdWebpack({config: basicConfig}),
// 		smWebpack.runProdWebpack({config: adminConfig}),
// 	]).then(() => {
// 		console.log('Done!');
// 	});
// }
if (command === 'refresh-db') {
	KnexUtils.refreshDb(env).then(() => {
		console.log('Done!');
		process.exit();
	}).catch((e) => {
		console.error(e);
		process.exit();
	});
}
