import { pickWord } from "./word.js";

const LINE = /^■(.+?)(?: {2}\{(.+?)\})? : (.*)$/;

/**
 * One Eijiro line as an entry, or null for lines the panel never shows.
 * @param {string} line
 */
export function parseLine(line) {
	const match = LINE.exec(line);
	if (!match) return null;
	const [, headword, partOfSpeech = null, text] = match;
	// Only double-clickable words can reach the panel, so phrases are dropped.
	if (pickWord(headword) !== headword) return null;
	// Lines without a part of speech are still translations unless they are
	// metadata such as 【発音】.
	if (text.startsWith("【")) return null;
	const translation = text.split(/◆|■・/)[0].trim();
	return translation ? { headword, partOfSpeech, translation } : null;
}

/**
 * Entries from an Eijiro text file (Shift JIS), read a chunk at a time so the
 * 150MB file is never held in memory whole.
 * @param {ReadableStream<Uint8Array>} stream
 */
export async function readEntries(stream) {
	const entries = [];
	const keep = (/** @type {string} */ line) => {
		const entry = parseLine(line.replace(/\r$/, ""));
		if (entry) entries.push(entry);
	};
	let rest = "";
	for await (const text of stream.pipeThrough(
		new TextDecoderStream("shift_jis"),
	)) {
		const lines = (rest + text).split("\n");
		rest = lines.pop() ?? "";
		lines.forEach(keep);
	}
	keep(rest);
	// Throwing before anything is stored keeps the previous import intact.
	if (!entries.length) throw new Error("英辞郎の行が見つかりません");
	return entries;
}
