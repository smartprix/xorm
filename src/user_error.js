class UserError extends Error {
	constructor(message) {
		super(message);
		this.data = message;
		this.name = 'UserError';
	}
}

export default UserError;
