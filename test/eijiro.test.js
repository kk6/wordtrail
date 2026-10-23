import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseLine, readEntries, toRecords } from "../extension/eijiro.js";

// Hand-written in Eijiro's format; the real data must never be committed.
const sample = readFileSync(
	new URL("./fixtures/eijiro-sample.txt", import.meta.url),
);

/** @param {Uint8Array} bytes @param {number} chunkSize */
const streamOf = (bytes, chunkSize) =>
	new ReadableStream({
		start(controller) {
			for (let i = 0; i < bytes.length; i += chunkSize) {
				controller.enqueue(bytes.subarray(i, i + chunkSize));
			}
			controller.close();
		},
	});

const SAMPLE_ENTRIES = [
	{ headword: "run", partOfSpeech: "自動-1", translation: "〔人が〕走る" },
	{ headword: "run", partOfSpeech: "他動-1", translation: "〔店を〕営む" },
	{ headword: "colour", partOfSpeech: "名", translation: "＝<→color>" },
	{ headword: "sample-word", partOfSpeech: null, translation: "見本の語" },
	{ headword: "US", partOfSpeech: "略", translation: "合衆国" },
	{ headword: "us", partOfSpeech: "代名", translation: "私たちを" },
	{ headword: "don't", partOfSpeech: "略", translation: "～しない" },
];

test("Shift JIS のファイルから、取り込む行だけを順に読む", async () => {
	assert.deepEqual(
		await readEntries(streamOf(sample, 64 * 1024)),
		SAMPLE_ENTRIES,
	);
});

test("読む単位の境目で文字や改行が切れても、全行が正しく取れる", async () => {
	assert.deepEqual(await readEntries(streamOf(sample, 1)), SAMPLE_ENTRIES);
});

test("英辞郎の行が 1 行もないファイルは、取り込まずに失敗する", async () => {
	const backup = new TextEncoder().encode('{"format":"wordtrail"}\n');
	await assert.rejects(readEntries(streamOf(backup, 64 * 1024)), {
		message: "英辞郎の行が見つかりません",
	});
});

test("見出し語、品詞、訳に分け、補足と例文を落とす", () => {
	assert.deepEqual(
		parseLine(
			"■run  {自動-1} : 〔人が〕走る◆テスト用の補足■・I run. 私は走る。",
		),
		{ headword: "run", partOfSpeech: "自動-1", translation: "〔人が〕走る" },
	);
});

test("例文の後に補足があっても、例文から後を落とす", () => {
	assert.equal(
		parseLine("■run  {他動-1} : 〔店を〕営む■・She runs a shop.◆補足")
			?.translation,
		"〔店を〕営む",
	);
});

test("参照の行は、そのまま残す", () => {
	assert.deepEqual(parseLine("■colour  {名} : ＝<→color>"), {
		headword: "colour",
		partOfSpeech: "名",
		translation: "＝<→color>",
	});
});

test("品詞のない行も、訳なら取り込む", () => {
	assert.deepEqual(parseLine("■sample-word : 見本の語"), {
		headword: "sample-word",
		partOfSpeech: null,
		translation: "見本の語",
	});
});

test("発音やレベルなどのメタ情報の行は、取り込まない", () => {
	assert.equal(parseLine("■run : 【レベル】1、【発音】r^n"), null);
});

test("1 語でない見出し語は、取り込まない", () => {
	assert.equal(parseLine("■look up  {句動-1} : 調べる"), null);
});

test("アポストロフィを含む 1 語は、取り込む", () => {
	assert.equal(parseLine("■don't  {略} : ～しない")?.headword, "don't");
});

test("英辞郎の形でない行は、取り込まない", () => {
	assert.equal(parseLine("run,走る"), null);
	assert.equal(parseLine(""), null);
});

test("取り込む行を、小文字の見出し語ごとに 1 件にまとめる", () => {
	assert.deepEqual(toRecords(SAMPLE_ENTRIES), [
		{ key: "run", entries: SAMPLE_ENTRIES.slice(0, 2) },
		{ key: "colour", entries: [SAMPLE_ENTRIES[2]] },
		{ key: "sample-word", entries: [SAMPLE_ENTRIES[3]] },
		{ key: "us", entries: SAMPLE_ENTRIES.slice(4, 6) },
		{ key: "don't", entries: [SAMPLE_ENTRIES[6]] },
	]);
});
