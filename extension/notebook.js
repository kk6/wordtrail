/**
 * The entry with the context appended, unless the same sentence is already there.
 * @param {{ contexts: { sentence: string }[] }} entry
 * @param {{ sentence: string, url: string, addedAt: string }} context
 */
export function addContext(entry, context) {
	if (entry.contexts.some(({ sentence }) => sentence === context.sentence))
		return entry;
	return { ...entry, contexts: [...entry.contexts, context] };
}

/**
 * The notebook with the word saved under its lowercased headword. A word saved
 * before keeps its createdAt and gains the context; its meanings are replaced.
 * @param {Record<string, object>} words
 * @param {{ headword: string, meanings: object[], context: { sentence: string, url: string, addedAt: string } }} edit
 */
export function saveEntry(words, { headword, meanings, context }) {
	const key = headword.toLowerCase();
	const saved = words[key];
	const entry = saved
		? addContext({ ...saved, headword, meanings }, context)
		: { headword, meanings, contexts: [context], createdAt: context.addedAt };
	return { ...words, [key]: entry };
}

/**
 * The notebook after meeting the word again, or the same notebook when the
 * word isn't registered. Contexts grow on the double-click itself, so each
 * time the word stumped the reader is counted even without saving.
 * @param {Record<string, { contexts: { sentence: string }[] }>} words
 * @param {string} word
 * @param {{ sentence: string, url: string, addedAt: string }} context
 */
export function addEncounter(words, word, context) {
	const key = word.toLowerCase();
	return words[key]
		? { ...words, [key]: addContext(words[key], context) }
		: words;
}

/**
 * The words, most recently registered first. createdAt is ISO 8601, so the
 * strings sort the same way as the times.
 * @param {Record<string, { createdAt: string }>} words
 */
export function newestFirst(words) {
	return Object.values(words).sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	);
}

/**
 * The notebook without the word.
 * @param {Record<string, object>} words
 * @param {string} headword
 */
export function removeWord(words, headword) {
	const { [headword.toLowerCase()]: _, ...rest } = words;
	return rest;
}
