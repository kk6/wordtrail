import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lookUp } from "../extension/dictionary.js";

const fixture = (name) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const respondWith = (body, status) => async () =>
	new Response(body, { status });

test("running の応答から、品詞ごとに最初の 2 個までの意味が残る", async () => {
	const meanings = await lookUp(
		"running",
		respondWith(fixture("dictionary-running.json"), 200),
	);
	assert.deepEqual(meanings, [
		{
			partOfSpeech: "verb",
			definitions: ["To move swiftly.", "(fluids) To flow."],
		},
		{
			partOfSpeech: "noun",
			definitions: [
				"The action of the verb to run.",
				"The activity of running as a form of exercise, as a sport, or for any other reason",
			],
		},
		{
			partOfSpeech: "adjective",
			definitions: ["Moving or advancing at a run.", "Present, current."],
		},
		{ partOfSpeech: "adverb", definitions: ["Consecutively; in a row"] },
		{
			partOfSpeech: "preposition",
			definitions: ["Approaching; about; roughly."],
		},
	]);
});

test("サーバーのエラー（Cloudflare の 524）では、意味が空になる", async () => {
	assert.deepEqual(
		await lookUp("running", respondWith(fixture("dictionary-524.txt"), 524)),
		[],
	);
});

test("通信に失敗すると、意味が空になる", async () => {
	const offline = async () => {
		throw new TypeError("fetch failed");
	};
	assert.deepEqual(await lookUp("running", offline), []);
});
