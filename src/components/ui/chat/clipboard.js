/**
 * Clipboard utilities for chat messages
 */

export async function handleCopy(text, id, setCopiedStates) {
    try {
        await navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [id]: false }));
        }, 2000);
    } catch {
        // Ignore clipboard errors - they're not critical
    }
}