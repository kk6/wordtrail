const ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DEFINITIONS_PER_PART = 2;

/**
 * Meanings of the word, or [] when the dictionary has none or can't be reached.
 * @param {string} word
 * @param {typeof fetch} fetchImpl
 */
export async function lookUp(word, fetchImpl = fetch) {
	try {
		const response = await fetchImpl(ENDPOINT + encodeURIComponent(word));
		return response.ok ? toMeanings(await response.json()) : [];
	} catch {
		return [];
	}
}

function toMeanings(entries) {
	const byPart = new Map();
	for (const entry of entries)
		for (const { partOfSpeech, definitions } of entry.meanings) {
			const kept = byPart.get(partOfSpeech) ?? [];
			for (const { definition } of definitions)
				if (kept.length < DEFINITIONS_PER_PART) kept.push(definition);
			byPart.set(partOfSpeech, kept);
		}
	return [...byPart].map(([partOfSpeech, definitions]) => ({
		partOfSpeech,
		definitions,
	}));
}
