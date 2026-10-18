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
