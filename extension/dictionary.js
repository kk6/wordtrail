// dictionaryapi.dev (built from Wiktionary) left unknown words hanging until a
// 524, so read Wiktionary's own REST API instead.
const ENDPOINT = "https://en.wiktionary.org/api/rest_v1/page/definition/";
const DEFINITIONS_PER_PART = 2;

/**
 * Meanings of the word, or [] when the dictionary has none or can't be reached.
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

function toMeanings(byLanguage) {
	return (byLanguage.en ?? [])
		.map(({ partOfSpeech, definitions }) => ({
			partOfSpeech: partOfSpeech.toLowerCase(),
			definitions: definitions
				.map(({ definition }) => toText(definition))
				.filter(Boolean)
				.slice(0, DEFINITIONS_PER_PART),
		}))
		.filter(({ definitions }) => definitions.length);
}

const ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

// Regexes rather than DOMParser so this runs under node --test; the result is
// only ever set as textContent.
function toText(html) {
	return html
		.replace(/<ol[\s\S]*$/, "") // sub-senses also come as their own definitions
		.replace(/<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "")
		.replace(/<span class="maintenance-line"[\s\S]*?<\/span>/g, "")
		.replace(/<[^>]*>/g, "")
		.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name) =>
			name[0] === "#"
				? String.fromCodePoint(Number(`0${name.slice(1)}`))
				: (ENTITIES[name] ?? entity),
		)
		.replace(/\s+/g, " ")
		.trim();
}
