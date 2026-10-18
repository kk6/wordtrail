import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMeanings, parseMeanings } from "../extension/meanings-text.js";

const meanings = [
	{ partOfSpeech: "verb", definitions: ["To move swiftly.", "To flow."] },
	{ partOfSpeech: "noun", definitions: ["The action of the verb to run."] },
];

test("品詞の見出しは : で終わる行、意味はその下の行になる", () => {
	assert.equal(
		formatMeanings(meanings),
		"verb:\nTo move swiftly.\nTo flow.\n\nnoun:\nThe action of the verb to run.",
	);
});

test("書き出したテキストを読むと、元の意味に戻る", () => {
	assert.deepEqual(parseMeanings(formatMeanings(meanings)), meanings);
});

test("見出しのない行は、品詞なしの意味になる", () => {
	assert.deepEqual(parseMeanings("走る\n\n 流れる "), [
		{ partOfSpeech: "", definitions: ["走る", "流れる"] },
	]);
});

test("意味のない見出しと空のテキストは残らない", () => {
	assert.deepEqual(parseMeanings("verb:\n\nnoun:\nA run."), [
		{ partOfSpeech: "noun", definitions: ["A run."] },
	]);
	assert.deepEqual(parseMeanings("  \n"), []);
});
