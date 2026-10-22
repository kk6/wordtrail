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
 * before keeps its createdAt and gains the context; its meanings and note are
 * replaced.
 * @param {Record<string, object>} words
 * @param {{ headword: string, meanings: object[], note: string, context: { sentence: string, url: string, addedAt: string } }} edit
 */
export function saveEntry(words, { headword, meanings, note, context }) {
	const key = headword.toLowerCase();
	const saved = words[key];
	const entry = saved
		? addContext({ ...saved, headword, meanings, note }, context)
		: {
				headword,
				meanings,
				note,
				contexts: [context],
				createdAt: context.addedAt,
			};
	return { ...words, [key]: entry };
}

/**
 * The word in the shape with a note, or the same word when it has one. Before
 * the note existed, the reader's own words were meanings without a part of
 * speech; Wiktionary always gives one, so those move to the note.
 * @param {{ meanings: { partOfSpeech: string, definitions: string[] }[], note?: string }} entry
 */
export function migrateEntry(entry) {
	if (typeof entry.note === "string") return entry;
	const own = entry.meanings.filter(({ partOfSpeech }) => !partOfSpeech);
	return {
		...entry,
		meanings: entry.meanings.filter(({ partOfSpeech }) => partOfSpeech),
		note: own.map(({ definitions }) => definitions.join("\n")).join("\n\n"),
	};
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
