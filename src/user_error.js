/**
 *
 * @param {string} modelName
 * @return {typeof Error}
 */
function customUserError(modelName) {
	class UserError extends Error {
		constructor(message) {
			let msgStr = message;
			if (typeof msgStr === 'object') {
				msgStr = JSON.stringify(message);
			}
			super(msgStr);
			this.data = message;
			this.name = 'UserError';
			this.model = modelName;
		}
	}
	return UserError;
}

export default customUserError('');
export {
	customUserError,
};
