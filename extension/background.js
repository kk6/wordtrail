import { addEncounter, migrateEntry } from "./notebook.js";
import { extractSentence } from "./sentence.js";
import { pickWord } from "./word.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Reloading or updating the extension fires this too, so words saved before
// the note existed get one the first time the new code runs.
chrome.runtime.onInstalled.addListener(async () => {
	const { words } = await chrome.storage.local.get("words");
	if (!words) return;
	const migrated = Object.fromEntries(
		Object.entries(words).map(([key, entry]) => [key, migrateEntry(entry)]),
	);
	if (Object.keys(words).some((key) => migrated[key] !== words[key]))
		await chrome.storage.local.set({ words: migrated });
});

chrome.runtime.onMessage.addListener((message, sender) => {
	if (message.type !== "dblclick" || !sender.tab) return;
	const word = pickWord(message.text);
	if (!word) return;
	const sentence = extractSentence(message.block, message.offset);
	// The tab's URL, since the word may be inside an iframe.
	const url = sender.tab.url;
	record(word, { sentence, url, addedAt: new Date().toISOString() });
});

async function record(word, context) {
	const { words = {} } = await chrome.storage.local.get("words");
	const updated = addEncounter(words, word, context);
	// Words first, so the panel reacting to the selection sees the new context.
	if (updated !== words) await chrome.storage.local.set({ words: updated });
	await chrome.storage.session.set({
		selection: {
			word,
			sentence: context.sentence,
			url: context.url,
			at: Date.now(),
		},
	});
}
