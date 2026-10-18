import { lookUp } from "./dictionary.js";
import { formatMeanings, parseMeanings } from "./meanings-text.js";
import { saveEntry } from "./notebook.js";

const [word, meanings, sentence, url, save, status, history, contexts] = [
	"word",
	"meanings",
	"sentence",
	"url",
	"save",
	"status",
	"history",
	"contexts",
].map((id) => document.getElementById(id));
let shown;

async function show(selection) {
	if (!selection) return;
	shown = selection;
	const headword = selection.word.toLowerCase();
	sentence.textContent = selection.sentence;
	url.textContent = selection.url;
	save.disabled = false;
	const { words = {} } = await chrome.storage.local.get("words");
	if (shown !== selection) return;
	const saved = words[headword];
	showHistory(saved?.contexts ?? []);
	if (saved) {
		word.value = saved.headword;
		meanings.value = formatMeanings(saved.meanings);
		meanings.placeholder = "";
		status.textContent = "登録済みの単語です。";
		return;
	}
	word.value = headword;
	status.textContent = "";
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

function showHistory(saved) {
	history.hidden = !saved.length;
	contexts.replaceChildren(
		...saved.map((context) => {
			const item = document.createElement("li");
			const where = document.createElement("small");
			where.textContent = context.url;
			item.append(context.sentence, document.createElement("br"), where);
			return item;
		}),
	);
}

save.addEventListener("click", async () => {
	const headword = word.value.trim();
	if (!headword) {
		status.textContent = "見出し語を入力してください。";
		return;
	}
	const { words = {} } = await chrome.storage.local.get("words");
	const updated = saveEntry(words, {
		headword,
		meanings: parseMeanings(meanings.value),
		context: {
			sentence: shown.sentence,
			url: shown.url,
			addedAt: new Date().toISOString(),
		},
	});
	await chrome.storage.local.set({ words: updated });
	status.textContent = "保存しました。";
	showHistory(updated[headword.toLowerCase()].contexts);
});

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
});
