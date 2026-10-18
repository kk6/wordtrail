const fields = ["word", "sentence", "url"].map((id) =>
	document.getElementById(id),
);

function show(selection) {
	if (!selection) return;
	for (const field of fields) field.textContent = selection[field.id];
}

chrome.storage.session
	.get("selection")
	.then(({ selection }) => show(selection));
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "session" && changes.selection) show(changes.selection.newValue);
});
