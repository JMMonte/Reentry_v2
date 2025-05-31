/**
 * Conversation turn management utilities
 */

export function maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress }) {
    if (outstandingToolCalls.current.size === 0 && conversationEndReceived.current) {
        setTurnInProgress(false);
        conversationEndReceived.current = false; // reset for next turn
    }
}