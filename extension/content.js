function closestBlock(node) {
	let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
	while (
		element.parentElement &&
		getComputedStyle(element).display.startsWith("inline")
	) {
		element = element.parentElement;
	}
	return element;
}

document.addEventListener("dblclick", () => {
	const selection = getSelection();
	if (!selection.rangeCount) return;
	const range = selection.getRangeAt(0);
	const block = closestBlock(range.startContainer);
	const before = document.createRange();
	before.setStart(block, 0);
	before.setEnd(range.startContainer, range.startOffset);
	chrome.runtime.sendMessage({
		type: "dblclick",
		text: String(selection),
		block: block.textContent,
		offset: before.toString().length,
	});
});
