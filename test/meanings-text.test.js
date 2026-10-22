import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMeanings } from "../extension/meanings-text.js";

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
