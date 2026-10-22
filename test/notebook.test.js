import assert from "node:assert/strict";
import { test } from "node:test";
import {
	addContext,
	addEncounter,
	migrateEntry,
	newestFirst,
	removeWord,
	saveEntry,
} from "../extension/notebook.js";

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

const context = {
	sentence: "Running is good exercise.",
	url: "https://example.com/d",
	addedAt: "2026-10-20T08:00:00Z",
};

test("未登録の語は、メモと文脈 1 件で新しく登録される", () => {
	const words = saveEntry(
		{},
		{
			headword: "running",
			meanings: entry.meanings,
			note: "走ること",
			context,
		},
	);
	assert.deepEqual(words, {
		running: {
			headword: "running",
			meanings: entry.meanings,
			note: "走ること",
			contexts: [context],
			createdAt: context.addedAt,
		},
	});
});

test("登録済みの語は、意味とメモを書き換え、文脈を足し、登録日時を保つ", () => {
	const meanings = [{ partOfSpeech: "noun", definitions: ["A run."] }];
	const words = saveEntry(
		{ run: { ...entry, note: "前のメモ" } },
		{ headword: "Run", meanings, note: "走る", context },
	);
	assert.deepEqual(words, {
		run: {
			headword: "Run",
			meanings,
			note: "走る",
			contexts: [...entry.contexts, context],
			createdAt: entry.createdAt,
		},
	});
});

test("登録済みの語に出会うと、大文字と小文字を区別せずに文脈が足される", () => {
	const words = addEncounter({ run: entry }, "Run", context);
	assert.deepEqual(words.run.contexts, [...entry.contexts, context]);
});

test("登録済みの語に同じ文で出会っても、文脈は増えない", () => {
	const once = addEncounter({ run: entry }, "run", context);
	assert.deepEqual(addEncounter(once, "run", context), once);
});

test("未登録の語に出会っても、単語帳は変わらない", () => {
	const words = { run: entry };
	assert.equal(addEncounter(words, "running", context), words);
});

const word = (headword, createdAt) => ({
	headword,
	meanings: [],
	contexts: [],
	createdAt,
});

test("一覧は、登録した日時の新しい順に並ぶ", () => {
	const words = {
		apple: word("apple", "2026-10-18T09:00:00Z"),
		cherry: word("cherry", "2026-10-20T09:00:00Z"),
		banana: word("banana", "2026-10-19T09:00:00Z"),
	};
	assert.deepEqual(
		newestFirst(words).map((entry) => entry.headword),
		["cherry", "banana", "apple"],
	);
});

test("削除すると、その単語だけが単語帳からなくなる", () => {
	const words = {
		run: entry,
		apple: word("apple", "2026-10-18T09:00:00Z"),
	};
	assert.deepEqual(removeWord(words, "Run"), { apple: words.apple });
	assert.deepEqual(Object.keys(words), ["run", "apple"]);
});

const oldShape = (meanings) => ({ ...word("run", context.addedAt), meanings });

test("品詞のない意味はメモに移り、品詞のある意味は残る", () => {
	const verb = { partOfSpeech: "verb", definitions: ["To move swiftly."] };
	assert.deepEqual(
		migrateEntry(
			oldShape([verb, { partOfSpeech: "", definitions: ["走る", "流れる"] }]),
		),
		{ ...oldShape([verb]), note: "走る\n流れる" },
	);
});

test("品詞のない意味が複数あると、空行で区切ってメモに入る", () => {
	assert.deepEqual(
		migrateEntry(
			oldShape([
				{ partOfSpeech: "", definitions: ["走る"] },
				{ partOfSpeech: "noun", definitions: ["A run."] },
				{ partOfSpeech: "", definitions: ["覚え方: ラン", "ran, run"] },
			]),
		),
		{
			...oldShape([{ partOfSpeech: "noun", definitions: ["A run."] }]),
			note: "走る\n\n覚え方: ラン\nran, run",
		},
	);
});

test("品詞のない意味がなければ、メモは空になる", () => {
	assert.deepEqual(migrateEntry(oldShape(entry.meanings)), {
		...oldShape(entry.meanings),
		note: "",
	});
});

test("メモを持つ語は、移した後の形なので変わらない", () => {
	const migrated = {
		...oldShape([{ partOfSpeech: "", definitions: ["手で書いた品詞なし"] }]),
		note: "",
	};
	assert.equal(migrateEntry(migrated), migrated);
	const once = migrateEntry(
		oldShape([{ partOfSpeech: "", definitions: ["走る"] }]),
	);
	assert.equal(migrateEntry(once), once);
});
