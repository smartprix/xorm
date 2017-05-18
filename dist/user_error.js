"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});
class UserError extends Error {
	constructor(message) {
		super(message);
		this.data = message;
	}
}

exports.default = UserError;