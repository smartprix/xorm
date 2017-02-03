import _ from 'lodash';

function isVowel(char) {
	return (/^[aeiou]$/i).test(char);
}

function isConsonant(char) {
	return !isVowel(char);
}

// Pluralize a character if the count is greater than 1
function plural(str, count = 2) {
	if (count <= 1 || !str || str.length <= 2) return str;

	if (str.charAt(str.length - 1) === 'y') {
		if (isVowel(str.charAt(str.length - 2))) {
			// If the y has a vowel before it (i.e. toys), then you just add the s.
			return str + 's';
		}

		// If a this ends in y with a consonant before it (fly)
		// you drop the y and add -ies to make it plural.
		return str.slice(0, -1) + 'ies';
	}
	else if (str.substring(str.length - 2) === 'us') {
		// ends in us -> i, needs to preceed the generic 's' rule
		return str.slice(0, -2) + 'i';
	}
	else if (
		['ch', 'sh'].indexOf(str.substring(str.length - 2)) !== -1 ||
		['x', 's'].indexOf(str.charAt(str.length - 1)) !== -1
	) {
		// If a this ends in ch, sh, x, s, you add -es to make it plural.
		return str + 'es';
	}

	// anything else, just add s
	return str + 's';
}

export {
	plural
};
