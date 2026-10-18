import { lookUp } from "./dictionary.js";

const [word, sentence, url, meanings] = [
	"word",
	"sentence",
	"url",
	"meanings",
].map((id) => document.getElementById(id));
let shown;

async function show(selection) {
	if (!selection) return;
	shown = selection;
	const headword = selection.word.toLowerCase();
	word.textContent = headword;
	sentence.textContent = selection.sentence;
	url.textContent = selection.url;
	meanings.textContent = "辞書を引いています…";
	const found = await lookUp(headword);
	if (shown !== selection) return;
	if (!found.length) {
		meanings.textContent =
			"辞書から意味を取れませんでした。意味は手で入力してください。";
		return;
	}
	meanings.replaceChildren(
		...found.flatMap(({ partOfSpeech, definitions }) => {
			const part = document.createElement("h2");
			part.textContent = partOfSpeech;
			const list = document.createElement("ol");
			list.append(
				...definitions.map((definition) => {
					const item = document.createElement("li");
					item.textContent = definition;
					return item;
				}),
			);
			return [part, list];
		}),
	);
}

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
});
