import { exportNotebook, importNotebook } from "./backup.js";
import { lookUp } from "./dictionary.js";
import { formatMeanings, parseMeanings } from "./meanings-text.js";
import { newestFirst, removeWord, saveEntry } from "./notebook.js";

const [
	word,
	meanings,
	sentence,
	url,
	save,
	unsaved,
	status,
	history,
	contexts,
	editor,
	list,
	toggleList,
	words,
	empty,
	exportButton,
	importButton,
	importFile,
	listStatus,
] = [
	"word",
	"meanings",
	"sentence",
	"url",
	"save",
	"unsaved",
	"status",
	"history",
	"contexts",
	"editor",
	"list",
	"toggle-list",
	"words",
	"empty",
	"export",
	"import",
	"import-file",
	"list-status",
].map((id) => document.getElementById(id));
let shown;
// The key of the saved word on screen, or null while showing a new one.
let showingKey = null;
// The fields as last shown or saved; anything else is an unsaved edit.
let baseline = { word: "", meanings: "" };

const edited = () =>
	word.value !== baseline.word || meanings.value !== baseline.meanings;

function markUnsaved() {
	unsaved.hidden = !edited();
}

function markSaved() {
	baseline = { word: word.value, meanings: meanings.value };
	markUnsaved();
}

function setStatus(text, warning = false) {
	status.textContent = text;
	status.classList.toggle("warning", warning);
}

// Imported files can hold any URL, so only web pages become links.
function contextLink(href) {
	const link = document.createElement("a");
	link.textContent = href;
	if (/^https?:/.test(href)) link.href = href;
	link.target = "_blank";
	link.rel = "noreferrer";
	return link;
}

async function show(selection) {
	if (!selection) return;
	// A double-click can't be undone, so ask before it replaces the edits.
	if (
		shown &&
		edited() &&
		!confirm(
			`保存していない変更があります。変更を捨てて「${selection.word.toLowerCase()}」を表示しますか？`,
		)
	)
		return;
	shown = selection;
	showEditor();
	const headword = selection.word.toLowerCase();
	sentence.textContent = selection.sentence;
	url.replaceChildren(contextLink(selection.url));
	save.disabled = false;
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	if (shown !== selection) return;
	const saved = notebook[headword];
	if (saved) {
		showSaved(saved, "登録済みの単語です。");
		return;
	}
	showingKey = null;
	showHistory([]);
	word.value = headword;
	setStatus("");
	meanings.value = "";
	meanings.placeholder = "辞書を引いています…";
	markSaved();
	const found = await lookUp(headword);
	if (shown !== selection) return;
	meanings.placeholder = found.length
		? ""
		: "辞書から意味を取れませんでした。意味は手で入力してください。";
	// Keep whatever the reader already typed while the lookup was running.
	if (!meanings.value) {
		meanings.value = formatMeanings(found);
		baseline.meanings = meanings.value;
	}
	markUnsaved();
}

function showSaved(saved, note, warning) {
	showingKey = saved.headword.toLowerCase();
	word.value = saved.headword;
	meanings.value = formatMeanings(saved.meanings);
	meanings.placeholder = "";
	showHistory(saved.contexts);
	setStatus(note, warning);
	markSaved();
}

word.addEventListener("input", markUnsaved);
meanings.addEventListener("input", markUnsaved);

// Saving under another saved word's headword would overwrite its meanings, so
// show that word instead and let the save add this sentence to it.
word.addEventListener("change", async () => {
	const key = word.value.trim().toLowerCase();
	if (!key || key === showingKey) return;
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const saved = notebook[key];
	if (saved)
		showSaved(
			saved,
			`登録済みの「${saved.headword}」を表示しています。保存すると、今の文を「${saved.headword}」の文脈に足します。`,
			true,
		);
});

function showHistory(saved) {
	history.hidden = !saved.length;
	contexts.replaceChildren(...saved.map(contextItem));
}

function contextItem(context) {
	const item = document.createElement("li");
	const where = document.createElement("small");
	where.append(contextLink(context.url));
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
	seen.className = "entry-contexts";
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

exportButton.addEventListener("click", async () => {
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const now = new Date().toISOString();
	const link = document.createElement("a");
	link.href = URL.createObjectURL(
		new Blob([exportNotebook(notebook, now)], { type: "application/json" }),
	);
	link.download = `wordtrail-${now.slice(0, 10)}.json`;
	link.click();
	// Revoking right after click() can cancel the download before it starts.
	setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
	listStatus.textContent = `${Object.keys(notebook).length} 語を書き出しました。`;
});

importButton.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
	const [file] = importFile.files;
	importFile.value = "";
	if (!file) return;
	const result = importNotebook(await file.text());
	if (result.error) {
		listStatus.textContent = `読み込めませんでした。${result.error}単語帳は変わっていません。`;
		return;
	}
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const count = (w) => Object.keys(w).length;
	if (
		!confirm(
			`今の単語帳（${count(notebook)} 語）を、ファイルの ${count(result.words)} 語で置き換えますか？`,
		)
	)
		return;
	await chrome.storage.local.set({ words: result.words });
	listStatus.textContent = `${count(result.words)} 語を読み込みました。`;
});

toggleList.addEventListener("click", () =>
	list.hidden ? showList() : showEditor(),
);

save.addEventListener("click", async () => {
	const headword = word.value.trim();
	if (!headword) {
		setStatus("見出し語を入力してください。");
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
	setStatus("保存しました。");
	showHistory(updated[headword.toLowerCase()].contexts);
	markSaved();
});

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
	if (area === "local" && changes.words && !list.hidden) renderList();
});
