// Meanings are shown as plain text with pre-line: "verb:" heads a part of
// speech and the lines under it are its definitions.

/** @param {{ partOfSpeech: string, definitions: string[] }[]} meanings */
export function formatMeanings(meanings) {
	return meanings
		.map(({ partOfSpeech, definitions }) =>
			[partOfSpeech && `${partOfSpeech}:`, ...definitions]
				.filter(Boolean)
				.join("\n"),
		)
		.join("\n\n");
}

/** @param {string} text */
export function parseMeanings(text) {
	const meanings = [];
	let current;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		// ponytail: a definition that itself ends with ":" reads as a heading.
		if (line.endsWith(":")) {
			current = { partOfSpeech: line.slice(0, -1).trim(), definitions: [] };
			meanings.push(current);
			continue;
		}
		if (!current) {
			current = { partOfSpeech: "", definitions: [] };
			meanings.push(current);
		}
		current.definitions.push(line);
	}
	return meanings.filter(({ definitions }) => definitions.length);
}
