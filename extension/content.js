document.addEventListener("dblclick", () => {
	chrome.runtime.sendMessage({
		type: "dblclick",
		text: String(getSelection()),
	});
});
