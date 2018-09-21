/**
 *
 * @param {string} modelName
 * @return {typeof Error}
 */
function customUserError(modelName) {
	class UserError extends Error {
		constructor(message) {
			super(message);
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
