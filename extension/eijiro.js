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

/**
 * Entries grouped under their lowercase headword, so one read finds every
 * spelling (US and us) of the word the panel looks up.
 * @param {{ headword: string, partOfSpeech: string | null, translation: string }[]} entries
 */
export function toRecords(entries) {
	const byKey = new Map();
	for (const entry of entries) {
		const key = entry.headword.toLowerCase();
		if (!byKey.has(key)) byKey.set(key, []);
		byKey.get(key).push(entry);
	}
	return [...byKey].map(([key, entries]) => ({ key, entries }));
}

/**
 * Translations as plain text in the shape of the Wiktionary section: "自動:"
 * heads a part of speech and its translations follow, numbered.
 * @param {string} key the lowercase headword that was looked up
 * @param {{ headword: string, partOfSpeech: string | null, translation: string }[]} entries
 */
export function formatTranslations(key, entries) {
	const groups = new Map();
	for (const { headword, partOfSpeech, translation } of entries) {
		// 自動-1 numbers a sense and 1-動 a homograph; the list numbers both.
		const part = partOfSpeech?.replace(/^\d+-|-\d+$/g, "") ?? "";
		const heading = [headword !== key && headword, part]
			.filter(Boolean)
			.join(" ");
		if (!groups.has(heading)) groups.set(heading, []);
		groups.get(heading).push(translation);
	}
	return [...groups]
		.map(([heading, translations]) =>
			[
				heading && `${heading}:`,
				...translations.map((t, i) => `${i + 1}. ${t}`),
			]
				.filter(Boolean)
				.join("\n"),
		)
		.join("\n\n");
}

// IndexedDB rather than chrome.storage.local, whose 10MB cap is below the
// ~26MB of translations.
const DB = "eijiro";
const WORDS = "words";
const META = "meta";

function openDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(WORDS, { keyPath: "key" });
			request.result.createObjectStore(META);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Replaces the stored translations in one transaction: if any write fails,
 * the earlier import stays as it was.
 * @param {ReturnType<typeof toRecords>} records
 * @param {string} fileName
 */
export async function replaceEijiro(records, fileName) {
	const db = await openDb();
	try {
		await new Promise((resolve, reject) => {
			const tx = db.transaction([WORDS, META], "readwrite");
			const words = tx.objectStore(WORDS);
			words.clear();
			for (const record of records) words.put(record);
			tx.objectStore(META).put({ fileName, count: records.length }, "import");
			tx.oncomplete = resolve;
			tx.onerror = tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** @returns {Promise<{ fileName: string, count: number } | undefined>} */
export async function eijiroImport() {
	const db = await openDb();
	try {
		return await new Promise((resolve, reject) => {
			const request = db.transaction(META).objectStore(META).get("import");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/**
 * The translations of key, [] when the import has none, or undefined when
 * nothing has been imported yet.
 * @param {string} key the lowercase headword
 */
export async function findInEijiro(key) {
	const db = await openDb();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction([WORDS, META]);
			const done = tx.objectStore(META).get("import");
			const found = tx.objectStore(WORDS).get(key);
			tx.oncomplete = () =>
				resolve(done.result && (found.result?.entries ?? []));
			tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
