import { lookUp } from "./dictionary.js";
import { formatMeanings, parseMeanings } from "./meanings-text.js";
import { saveEntry } from "./notebook.js";

const [word, meanings, sentence, url, save, status] = [
	"word",
	"meanings",
	"sentence",
	"url",
	"save",
	"status",
].map((id) => document.getElementById(id));
let shown;

async function show(selection) {
	if (!selection) return;
	shown = selection;
	const headword = selection.word.toLowerCase();
	word.value = headword;
	sentence.textContent = selection.sentence;
	url.textContent = selection.url;
	status.textContent = "";
	save.disabled = false;
	meanings.value = "";
	meanings.placeholder = "辞書を引いています…";
	const found = await lookUp(headword);
	if (shown !== selection) return;
	meanings.placeholder = found.length
		? ""
		: "辞書から意味を取れませんでした。意味は手で入力してください。";
	// Keep whatever the reader already typed while the lookup was running.
	if (!meanings.value) meanings.value = formatMeanings(found);
}

save.addEventListener("click", async () => {
	const headword = word.value.trim();
	if (!headword) {
		status.textContent = "見出し語を入力してください。";
		return;
	}
	const { words = {} } = await chrome.storage.local.get("words");
	await chrome.storage.local.set({
		words: saveEntry(words, {
			headword,
			meanings: parseMeanings(meanings.value),
			context: {
				sentence: shown.sentence,
				url: shown.url,
				addedAt: new Date().toISOString(),
			},
		}),
	});
	status.textContent = "保存しました。";
});

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
});
