const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const collapse = (text) => text.replace(/\s+/g, " ");

/**
 * Collapses whitespace before segmenting, because ICU treats every newline as
 * a sentence break while HTML renders source newlines as plain spaces.
 * @param {string} text
 * @param {number} offset
 */
export function extractSentence(text, offset) {
	const found = segmenter
		.segment(collapse(text))
		.containing(collapse(text.slice(0, offset)).length);
	return found ? found.segment.trim() : "";
}
