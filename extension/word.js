const WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;

/** @param {string} text */
export function pickWord(text) {
	const word = text.trim();
	return WORD.test(word) ? word : null;
}
