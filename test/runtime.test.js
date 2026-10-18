import assert from "node:assert/strict";
import { test } from "node:test";

test("実行環境が英語の文単位の分割に対応している", () => {
	const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
	const sentences = [...segmenter.segment("See e.g. this. Then that.")].map(
		(s) => s.segment.trim(),
	);
	assert.deepEqual(sentences, ["See e.g. this.", "Then that."]);
});
