const wordElement = document.getElementById("word");

function show(selection) {
	if (selection) wordElement.textContent = selection.word;
}

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
});
