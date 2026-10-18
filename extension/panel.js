import { lookUp } from "./dictionary.js";
import { formatMeanings, parseMeanings } from "./meanings-text.js";
import { newestFirst, removeWord, saveEntry } from "./notebook.js";

const [
	word,
	meanings,
	sentence,
	url,
	save,
	status,
	history,
	contexts,
	editor,
	list,
	toggleList,
	words,
	empty,
] = [
	"word",
	"meanings",
	"sentence",
	"url",
	"save",
	"status",
	"history",
	"contexts",
	"editor",
	"list",
	"toggle-list",
	"words",
	"empty",
].map((id) => document.getElementById(id));
let shown;

async function show(selection) {
	if (!selection) return;
	shown = selection;
	showEditor();
	const headword = selection.word.toLowerCase();
	sentence.textContent = selection.sentence;
	url.textContent = selection.url;
	save.disabled = false;
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	if (shown !== selection) return;
	const saved = notebook[headword];
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
	contexts.replaceChildren(...saved.map(contextItem));
}

function contextItem(context) {
	const item = document.createElement("li");
	const where = document.createElement("small");
	where.textContent = context.url;
	item.append(context.sentence, document.createElement("br"), where);
	return item;
}

function showEditor() {
	list.hidden = true;
	editor.hidden = false;
	toggleList.textContent = "一覧";
}

function showList() {
	editor.hidden = true;
	list.hidden = false;
	toggleList.textContent = "戻る";
	return renderList();
}

async function renderList() {
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const entries = newestFirst(notebook);
	empty.hidden = entries.length > 0;
	words.replaceChildren(...entries.map(entryItem));
}

function entryItem(entry) {
	const item = document.createElement("li");
	item.dataset.headword = entry.headword;
	const details = document.createElement("details");
	const summary = document.createElement("summary");
	summary.textContent = entry.headword;
	const text = document.createElement("p");
	text.className = "meanings";
	text.textContent = formatMeanings(entry.meanings);
	const seen = document.createElement("ol");
	seen.append(...entry.contexts.map(contextItem));
	const remove = document.createElement("button");
	remove.type = "button";
	remove.className = "delete";
	remove.textContent = "削除";
	remove.addEventListener("click", async () => {
		if (!confirm(`「${entry.headword}」を単語帳から削除しますか？`)) return;
		const { words: notebook = {} } = await chrome.storage.local.get("words");
		// The list redraws itself from the storage change.
		await chrome.storage.local.set({
			words: removeWord(notebook, entry.headword),
		});
	});
	details.append(summary, text, seen, remove);
	item.append(details);
	return item;
}

toggleList.addEventListener("click", () =>
	list.hidden ? showList() : showEditor(),
);

save.addEventListener("click", async () => {
	const headword = word.value.trim();
	if (!headword) {
		status.textContent = "見出し語を入力してください。";
		return;
	}
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const updated = saveEntry(notebook, {
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
	if (area === "local" && changes.words && !list.hidden) renderList();
});
