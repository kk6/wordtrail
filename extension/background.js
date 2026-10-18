import { extractSentence } from "./sentence.js";
import { pickWord } from "./word.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender) => {
	if (message.type !== "dblclick" || !sender.tab) return;
	const word = pickWord(message.text);
	if (!word) return;
	chrome.storage.session.set({
		selection: {
			word,
			sentence: extractSentence(message.block, message.offset),
			// The tab's URL, since the word may be inside an iframe.
			url: sender.tab.url,
			at: Date.now(),
		},
	});
});
