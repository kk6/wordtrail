import assert from "node:assert/strict";
import { test } from "node:test";
import { pickWord } from "../extension/word.js";

test("前後の空白を除いた英単語を返す", () => {
	assert.equal(pickWord(" ubiquitous "), "ubiquitous");
});

test("アポストロフィやハイフンを含む 1 語はそのまま返す", () => {
	assert.equal(pickWord("don't"), "don't");
	assert.equal(pickWord("well-known"), "well-known");
});

test("英単語 1 語でない選択は null を返す", () => {
	for (const text of [
		"",
		"   ",
		"two words",
		"単語",
		"2024",
		"API.",
		"-flag",
	]) {
		assert.equal(pickWord(text), null, JSON.stringify(text));
	}
});
