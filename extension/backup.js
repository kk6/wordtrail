import { migrateEntry, newestFirst } from "./notebook.js";

const FORMAT = "wordtrail";
// Version 1 files come from before the note: they are read in the old shape
// and migrated the same way as the stored words.
const VERSION = 2;

/**
 * The whole notebook as the text of one JSON file.
 * @param {Record<string, object>} words
 * @param {string} exportedAt
 */
export function exportNotebook(words, exportedAt) {
	return JSON.stringify(
		{ format: FORMAT, version: VERSION, exportedAt, words: newestFirst(words) },
		null,
		"\t",
	);
}

/**
 * The notebook in an exported file, or why the file can't be read. Nothing
 * is half-read: one bad word rejects the whole file, so the notebook in use
 * is only ever replaced by a complete one.
 * @param {string} text
 * @returns {{ words: Record<string, object> } | { error: string }}
 */
export function importNotebook(text) {
	let file;
	try {
		file = JSON.parse(text);
	} catch {
		return { error: "JSON のファイルではありません。" };
	}
	if (file?.format !== FORMAT)
		return { error: "Wordtrail から書き出したファイルではありません。" };
	if (file.version !== VERSION && file.version !== 1)
		return { error: `対応していない版です（${file.version}）。` };
	if (!Array.isArray(file.words))
		return { error: "単語の一覧が入っていません。" };
	const words = {};
	for (const [index, entry] of file.words.entries()) {
		if (!isEntry(entry) || (file.version === VERSION && !isText(entry.note)))
			return { error: `${index + 1} 語目の形が正しくありません。` };
		const key = entry.headword.toLowerCase();
		if (words[key])
			return { error: `「${entry.headword}」が 2 回入っています。` };
		words[key] = file.version === 1 ? migrateEntry(entry) : entry;
	}
	return { words };
}

const isText = (value) => typeof value === "string";

function isEntry(entry) {
	return (
		isText(entry?.headword) &&
		entry.headword.trim() !== "" &&
		isText(entry.createdAt) &&
		Array.isArray(entry.meanings) &&
		entry.meanings.every(
			(meaning) =>
				isText(meaning?.partOfSpeech) &&
				Array.isArray(meaning.definitions) &&
				meaning.definitions.every(isText),
		) &&
		Array.isArray(entry.contexts) &&
		entry.contexts.every(
			(context) =>
				isText(context?.sentence) &&
				isText(context.url) &&
				isText(context.addedAt),
		)
	);
}
