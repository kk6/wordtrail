const ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DEFINITIONS_PER_PART = 2;

/**
 * Meanings of the word, or [] when the dictionary has none or can't be reached.
 * Unknown words can hang until Cloudflare's 524 at ~100s, so give up early.
 * @param {string} word
 * @param {typeof fetch} fetchImpl
 * @param {number} timeoutMs
 */
export async function lookUp(word, fetchImpl = fetch, timeoutMs = 10_000) {
	try {
		const response = await fetchImpl(ENDPOINT + encodeURIComponent(word), {
			signal: AbortSignal.timeout(timeoutMs),
		});
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
