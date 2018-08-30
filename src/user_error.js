class UserError extends Error {
	constructor(message) {
		super(message);
		this.data = message;
		this.name = 'UserError';
	}
}

export default UserError;

/**
 *
 * @param {string} modelName
 * @return {typeof Error}
 */
function customUserError(modelName) {
	class CustomError extends Error {
		constructor(message) {
			super(message);
			this.data = message;
			this.name = modelName ? `${modelName}Error` : 'UserError';
			this.model = modelName;
		}
	}
	return CustomError;
}

export {
	customUserError,
};
