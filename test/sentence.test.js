import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSentence } from "../extension/sentence.js";

const text =
	"Use a POST request, e.g. when creating a resource. The U.S. team deprecated the old API. It is idempotent.";

test("位置を含む 1 文を返す", () => {
	assert.equal(
		extractSentence(text, text.indexOf("idempotent")),
		"It is idempotent.",
	);
});

test("e.g. や U.S. のところで文が切れない", () => {
	assert.equal(
		extractSentence(text, text.indexOf("creating")),
		"Use a POST request, e.g. when creating a resource.",
	);
	assert.equal(
		extractSentence(text, text.indexOf("deprecated")),
		"The U.S. team deprecated the old API.",
	);
});

test("文の先頭の語でも、その文を返す", () => {
	assert.equal(extractSentence(text, 0), extractSentence(text, 4));
});

test("改行やインデントは 1 つの空白にまとめる", () => {
	const html = "\n    The API is\n    ubiquitous now.\n  ";
	assert.equal(
		extractSentence(html, html.indexOf("ubiquitous")),
		"The API is ubiquitous now.",
	);
});
