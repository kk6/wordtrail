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
