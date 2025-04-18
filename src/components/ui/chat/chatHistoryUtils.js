// chatHistoryUtils.js
// Utility functions for chat history and UI

export function maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress }) {
    if (outstandingToolCalls.current.size === 0 && conversationEndReceived.current) {
        setTurnInProgress(false);
        conversationEndReceived.current = false; // reset for next turn
    }
}

export async function handleCopy(text, id, setCopiedStates) {
    try {
        await navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [id]: false }));
        }, 2000);
    } catch {
        // ignore
    }
} 