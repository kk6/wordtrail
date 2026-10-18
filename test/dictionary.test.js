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
		respondWith(fixture("wiktionary-running.json"), 200),
	);
	assert.deepEqual(meanings, [
		{
			partOfSpeech: "verb",
			definitions: ["present participle and gerund of run"],
		},
		{
			partOfSpeech: "adjective",
			definitions: [
				"Moving or advancing at a run.",
				"Of a horse, having a running gait; not a trotter or pacer.",
			],
		},
		{ partOfSpeech: "adverb", definitions: ["Consecutively; in a row."] },
		{
			partOfSpeech: "noun",
			definitions: [
				"The action of the verb to run.",
				"The activity of running as a form of exercise, as a sport, or for any other reason.",
			],
		},
		{
			partOfSpeech: "preposition",
			definitions: ["Approaching; about; roughly."],
		},
	]);
});

test("定義の HTML から、タグ、スタイル、下位の語義を除いた文だけが残る", async () => {
	const [noun, verb] = await lookUp(
		"work",
		respondWith(fixture("wiktionary-work.json"), 200),
	);
	assert.deepEqual(noun.definitions, [
		"Employment.",
		"Labour, occupation, job.",
	]);
	assert.deepEqual(verb.definitions, [
		"To do a specific task by employing physical or mental powers.",
		"Said of one's workplace (building), or one's department, or one's trade (sphere of business) [with in or at].",
	]);
});

test("見つからない語（404）では、意味が空になる", async () => {
	assert.deepEqual(
		await lookUp(
			"qwzxvbn",
			respondWith(fixture("wiktionary-not-found.json"), 404),
		),
		[],
	);
});

test("サーバーのエラー（Cloudflare の 524）では、意味が空になる", async () => {
	assert.deepEqual(
		await lookUp("running", respondWith(fixture("server-error-524.txt"), 524)),
		[],
	);
});

test("通信に失敗すると、意味が空になる", async () => {
	const offline = async () => {
		throw new TypeError("fetch failed");
	};
	assert.deepEqual(await lookUp("running", offline), []);
});

test("応答が時間内に来なければ、意味が空になる", {
	timeout: 1000,
}, async () => {
	const hanging = (_, options) =>
		new Promise((_, reject) => {
			// A real fetch keeps the event loop alive; AbortSignal.timeout alone doesn't.
			const pending = setTimeout(() => {}, 2000);
			options?.signal?.addEventListener("abort", () => {
				clearTimeout(pending);
				reject(options.signal.reason);
			});
		});
	assert.deepEqual(await lookUp("running", hanging, 10), []);
});
