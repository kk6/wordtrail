import assert from "node:assert/strict";
import { test } from "node:test";
import { exportNotebook, importNotebook } from "../extension/backup.js";

const words = {
	run: {
		headword: "Run",
		meanings: [{ partOfSpeech: "verb", definitions: ["走る"] }],
		contexts: [
			{
				sentence: "I run every morning.",
				url: "https://example.com/a",
				addedAt: "2026-10-18T12:00:00Z",
			},
		],
		createdAt: "2026-10-18T12:00:00Z",
	},
	apple: {
		headword: "apple",
		meanings: [],
		contexts: [],
		createdAt: "2026-10-19T12:00:00Z",
	},
};

test("書き出したファイルを読み込むと、全単語と全文脈が元に戻る", () => {
	const file = exportNotebook(words, "2026-10-20T00:00:00Z");
	assert.deepEqual(importNotebook(file), { words });
});

test("書き出したファイルには、形式と版と書き出した日時が入る", () => {
	const file = JSON.parse(exportNotebook(words, "2026-10-20T00:00:00Z"));
	assert.equal(file.format, "wordtrail");
	assert.equal(file.version, 1);
	assert.equal(file.exportedAt, "2026-10-20T00:00:00Z");
	assert.equal(file.words.length, 2);
});

const valid = () => JSON.parse(exportNotebook(words, "2026-10-20T00:00:00Z"));
// change gets the file and its "Run" entry, the one with meanings and contexts.
const broken = (change) => {
	const file = valid();
	change(
		file,
		file.words.find((w) => w.headword === "Run"),
	);
	return JSON.stringify(file);
};

test("形の違うファイルは、理由を添えて拒否する", () => {
	for (const [label, text] of [
		["JSON でない", "not json"],
		["Wordtrail の形式でない", JSON.stringify({ words: [] })],
		["版が違う", broken((f) => (f.version = 2))],
		["words が配列でない", broken((f) => (f.words = {}))],
		["見出し語が空", broken((_, run) => (run.headword = ""))],
		[
			"意味が文字列でない",
			broken((_, run) => (run.meanings[0].definitions = [1])),
		],
		["文脈に URL がない", broken((_, run) => delete run.contexts[0].url)],
		["登録日時がない", broken((_, run) => delete run.createdAt)],
		[
			"同じ見出し語が 2 つある",
			broken((f) => f.words.push({ ...f.words[0], headword: "RUN" })),
		],
	]) {
		const result = importNotebook(text);
		assert.equal(result.words, undefined, label);
		assert.equal(typeof result.error, "string", label);
	}
});
