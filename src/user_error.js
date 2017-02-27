class UserError extends Error {
	constructor(message) {
		super(message);
		this.data = message;
	}
}

export default UserError;
