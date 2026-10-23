import { exportNotebook, importNotebook } from "./backup.js";
import { lookUp } from "./dictionary.js";
import {
	eijiroImport,
	findInEijiro,
	formatTranslations,
	readEntries,
	replaceEijiro,
	toRecords,
} from "./eijiro.js";
import { formatMeanings } from "./meanings-text.js";
import { newestFirst, removeWord, saveEntry } from "./notebook.js";

const [
	word,
	meanings,
	note,
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
	speakWord,
	speakSentence,
	eijiroButton,
	eijiroFile,
	eijiroStatus,
	eijiroSection,
	translations,
] = [
	"word",
	"meanings",
	"note",
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
	"speak-word",
	"speak-sentence",
	"eijiro",
	"eijiro-file",
	"eijiro-status",
	"eijiro-section",
	"translations",
].map((id) => document.getElementById(id));
let shown;
// What the Wiktionary section shows: the meanings for key, null while they are
// looked up, and ready once they are in.
let dictionary = { key: "", meanings: [], ready: Promise.resolve() };
// The latest run of the headword's change handler. Clicking 保存 right after
// editing the headword fires change first, so the save waits for it.
let switching = Promise.resolve();
// The fields as last shown or saved; anything else is an unsaved edit.
let baseline = { word: "", note: "" };

const edited = () =>
	word.value !== baseline.word || note.value !== baseline.note;

function markUnsaved() {
	unsaved.hidden = !edited();
}

function markSaved() {
	baseline = { word: word.value, note: note.value };
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
	showHistory([]);
	word.value = headword;
	note.value = "";
	setStatus("");
	markSaved();
	lookUpMeanings(headword);
}

function showSaved(saved, status, warning) {
	word.value = saved.headword;
	note.value = saved.note;
	showMeanings({
		key: saved.headword.toLowerCase(),
		meanings: saved.meanings,
		ready: Promise.resolve(),
	});
	showTranslations(saved.headword.toLowerCase());
	showHistory(saved.contexts);
	setStatus(status, warning);
	markSaved();
}

function lookUpMeanings(key) {
	const looking = { key, meanings: null };
	looking.ready = lookUp(key).then((found) => {
		looking.meanings = found;
		if (dictionary === looking) showMeanings(looking);
	});
	showMeanings(looking);
	showTranslations(key);
}

// Looked up each time rather than saved with the word: the data can't be
// redistributed, so it must stay out of the notebook and its exports.
async function showTranslations(key) {
	const found = await findInEijiro(key);
	// Another word took the screen while this one was looked up.
	if (dictionary.key !== key) return;
	eijiroSection.hidden = !found;
	translations.textContent = found?.length
		? formatTranslations(key, found)
		: "英辞郎に見つかりませんでした。";
	translations.classList.toggle("muted", !found?.length);
}

function showMeanings(next) {
	dictionary = next;
	const found = next.meanings;
	meanings.textContent = !found
		? "Wiktionary を引いています…"
		: found.length
			? formatMeanings(found)
			: "Wiktionary に見つかりませんでした。調べたことや自分の言葉は、メモに書いてください。";
	meanings.classList.toggle("muted", !found?.length);
}

word.addEventListener("input", markUnsaved);
note.addEventListener("input", markUnsaved);

// Only once the reader leaves the field, so a half-typed word is never looked up.
word.addEventListener("change", () => {
	switching = switchHeadword();
});

async function switchHeadword() {
	const selection = shown;
	const key = word.value.trim().toLowerCase();
	if (!key || key === dictionary.key) return;
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	if (shown !== selection) return;
	const saved = notebook[key];
	// Saving under another saved word's headword would overwrite its meanings,
	// so show that word instead and let the save add this sentence to it.
	if (saved) {
		showSaved(
			saved,
			`登録済みの「${saved.headword}」を表示しています。保存すると、今の文を「${saved.headword}」の文脈に足します。`,
			true,
		);
		return;
	}
	showHistory([]);
	setStatus("");
	lookUpMeanings(key);
}

function showHistory(saved) {
	history.hidden = !saved.length;
	contexts.replaceChildren(...saved.map(contextItem));
}

function contextItem(context) {
	const item = document.createElement("li");
	const play = speakButton("文を読み上げる", context.sentence);
	const where = document.createElement("small");
	where.append(contextLink(context.url));
	item.append(context.sentence, " ", play, document.createElement("br"), where);
	return item;
}

function speakButton(label, text) {
	const play = document.createElement("button");
	play.type = "button";
	play.className = "speak";
	play.textContent = "▶";
	play.ariaLabel = play.title = label;
	play.addEventListener("click", () => speak(text));
	return play;
}

function speak(text) {
	if (!text) return;
	// Otherwise a second click waits until the first sentence is read out.
	speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = "en-US";
	// lang alone makes Chrome on macOS read in Albert, a novelty voice.
	const samantha = speechSynthesis
		.getVoices()
		.find((v) => v.name === "Samantha");
	if (samantha) utterance.voice = samantha;
	speechSynthesis.speak(utterance);
}

speakWord.addEventListener("click", () => speak(word.value.trim()));
speakSentence.addEventListener("click", () => speak(sentence.textContent));

function showEditor() {
	list.hidden = true;
	editor.hidden = false;
	toggleList.textContent = "一覧";
}

function showList() {
	editor.hidden = true;
	list.hidden = false;
	toggleList.textContent = "戻る";
	showEijiroImport();
	return renderList();
}

async function showEijiroImport() {
	const done = await eijiroImport();
	eijiroStatus.textContent = done
		? `英辞郎：${done.count.toLocaleString("ja-JP")} 語（${done.fileName}）`
		: "英辞郎は取り込んでいません。";
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
	// Chrome doesn't toggle the details for a click on a button in the summary,
	// so the ▶ needs no preventDefault.
	summary.append(
		entry.headword,
		" ",
		speakButton("見出し語を読み上げる", entry.headword),
	);
	const parts = [
		labelled(
			"Wiktionary",
			entry.meanings.length
				? formatMeanings(entry.meanings)
				: "Wiktionary に見つかりませんでした。",
			entry.meanings.length ? "meanings" : "meanings muted",
		),
	];
	if (entry.note) parts.push(labelled("メモ", entry.note, "note"));
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
	details.append(summary, ...parts, seen, remove);
	item.append(details);
	return item;
}

function labelled(label, text, className) {
	const tag = document.createElement("span");
	tag.className = "tag";
	tag.textContent = label;
	const body = document.createElement("p");
	body.className = className;
	body.textContent = text;
	const part = document.createElement("div");
	part.append(tag, body);
	return part;
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

eijiroButton.addEventListener("click", () => eijiroFile.click());

eijiroFile.addEventListener("change", async () => {
	const [file] = eijiroFile.files;
	eijiroFile.value = "";
	if (!file) return;
	eijiroButton.disabled = true;
	eijiroStatus.textContent = "英辞郎を取り込んでいます…";
	try {
		const records = toRecords(await readEntries(file.stream()));
		await replaceEijiro(records, file.name);
		await showEijiroImport();
	} catch (error) {
		eijiroStatus.textContent = `取り込めませんでした（${error.message}）。前に取り込んだ英辞郎はそのままです。`;
	} finally {
		eijiroButton.disabled = false;
	}
});

toggleList.addEventListener("click", () =>
	list.hidden ? showList() : showEditor(),
);

save.addEventListener("click", async () => {
	const selection = shown;
	const headword = word.value.trim();
	if (!headword) {
		setStatus("見出し語を入力してください。");
		return;
	}
	await switching;
	await dictionary.ready;
	// Another word took the screen while waiting, so the meanings on hand
	// belong to it, not to this headword.
	if (shown !== selection || dictionary.key !== headword.toLowerCase()) return;
	const { words: notebook = {} } = await chrome.storage.local.get("words");
	const updated = saveEntry(notebook, {
		headword,
		meanings: dictionary.meanings,
		note: note.value,
		context: {
			sentence: selection.sentence,
			url: selection.url,
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
