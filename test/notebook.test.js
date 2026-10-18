import assert from "node:assert/strict";
import { test } from "node:test";
import { addContext } from "../extension/notebook.js";

const entry = {
	headword: "run",
	meanings: [{ partOfSpeech: "verb", definitions: ["To move swiftly."] }],
	contexts: [
		{
			sentence: "I run every morning.",
			url: "https://example.com/a",
			addedAt: "2026-10-18T12:00:00Z",
		},
	],
	createdAt: "2026-10-18T12:00:00Z",
};

test("新しい文は、文脈の最後に追加される", () => {
	const context = {
		sentence: "The tests run in parallel.",
		url: "https://example.com/b",
		addedAt: "2026-10-19T09:00:00Z",
	};
	assert.deepEqual(addContext(entry, context), {
		...entry,
		contexts: [...entry.contexts, context],
	});
});

test("同じ文は、別のページで出会っても追加されない", () => {
	const again = {
		sentence: "I run every morning.",
		url: "https://example.com/c",
		addedAt: "2026-10-19T09:00:00Z",
	};
	assert.deepEqual(addContext(entry, again), entry);
});

test("元の単語は書き換えない", () => {
	const before = structuredClone(entry);
	addContext(entry, {
		sentence: "The tests run in parallel.",
		url: "https://example.com/b",
		addedAt: "2026-10-19T09:00:00Z",
	});
	assert.deepEqual(entry, before);
});
