/**
 * The entry with the context appended, unless the same sentence is already there.
 * @param {{ contexts: { sentence: string }[] }} entry
 * @param {{ sentence: string, url: string, addedAt: string }} context
 */
export function addContext(entry, context) {
	if (entry.contexts.some(({ sentence }) => sentence === context.sentence))
		return entry;
	return { ...entry, contexts: [...entry.contexts, context] };
}
