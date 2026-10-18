import { pickWord } from "./word.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender) => {
	if (message.type !== "dblclick" || !sender.tab) return;
	const word = pickWord(message.text);
	if (!word) return;
	// sidePanel.open() needs the user gesture, which is lost after the first await.
	chrome.sidePanel.open({ tabId: sender.tab.id });
	chrome.storage.session.set({ selection: { word, at: Date.now() } });
});
