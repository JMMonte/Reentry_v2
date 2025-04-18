import { useState, useEffect, useRef } from 'react';
import * as handlers from './ChatSocketEventHandlers';
import { maybeEndTurn, handleCopy } from './chatHistoryUtils';

export function useChatSocket(socket) {
    const [messages, setMessages] = useState([]);
    const [userMessage, setUserMessage] = useState('');
    const [threadId, setThreadId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [copiedStates, setCopiedStates] = useState({});
    const [tableData] = useState(new Map());
    // Track the latest previous_response_id for multi-turn context
    const previousResponseId = useRef(null);
    const [turnInProgress, setTurnInProgress] = useState(false);
    // Track outstanding tool calls by call_id
    const outstandingToolCalls = useRef(new Set());
    // Track if conversation_end has been received for this turn
    const conversationEndReceived = useRef(false);

    // --- Event Handlers (bound with state/refs) ---
    const eventHandlers = {
        conversation_start: handlers.handleConversationStart({ setMessages, setTurnInProgress }),
        answer_start: handlers.handleAnswerStart({ setMessages, setIsLoading }),
        message: handlers.handleMessage({ setMessages, setIsLoading }),
        answer_end: handlers.handleAnswerEnd({ setMessages, setIsLoading, previousResponseId }),
        conversation_end: handlers.handleConversationEnd({ setMessages, conversationEndReceived, maybeEndTurn: () => maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress }) }),
        tool_call_sent: handlers.handleToolCallSent({ setMessages, socket, outstandingToolCalls, windowApi: window.api }),
        tool_call_response: handlers.handleToolCallResponse({ setMessages, outstandingToolCalls, maybeEndTurn: () => maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress }) }),
        error: handlers.handleError({ setIsLoading, setMessages }),
        threadCreated: handlers.handleThreadCreated({ setThreadId }),
        runCompleted: handlers.handleRunCompleted({ setIsLoading }),
        connect: handlers.handleConnect({ setIsConnected }),
        disconnect: handlers.handleDisconnect({ setIsConnected, setIsLoading })
    };

    useEffect(() => {
        if (!socket) return;

        // Remove debug: Log raw tool_call_sent events
        // socket.on('tool_call_sent', (rawEvent) => {
        //     console.log('[FRONTEND RAW tool_call_sent EVENT]', JSON.stringify(rawEvent, null, 2));
        // });

        Object.keys(eventHandlers).forEach(event => {
            socket.on(event, eventHandlers[event]);
        });
        if (socket.onAny) {
            socket.onAny((event) => {
                if (!eventHandlers[event]) {
                    // No debug warning
                }
            });
        }
        return () => {
            // socket.off('tool_call_sent');
            Object.keys(eventHandlers).forEach(event => {
                socket.off(event, eventHandlers[event]);
            });
            if (socket.offAny) {
                socket.offAny();
            }
        };
    }, [socket]);

    // --- User message sending logic ---
    const sendMessage = async () => {
        if (!userMessage.trim() || !isConnected || turnInProgress) return;
        setIsLoading(true);
        setTurnInProgress(true);
        try {
            if (previousResponseId.current) {
                socket.emit('chat message', userMessage, previousResponseId.current);
            } else {
                socket.emit('chat message', userMessage);
            }
            setUserMessage('');
        } catch {
            setIsLoading(false);
            setMessages(prev => [...prev, {
                id: Date.now(),
                role: 'error',
                content: 'Failed to send message. Please try again.',
                status: 'completed'
            }]);
        }
    };

    // --- Copy logic ---
    const handleCopyWrapper = (text, id) => handleCopy(text, id, setCopiedStates);

    return {
        messages,
        setMessages,
        userMessage,
        setUserMessage,
        threadId,
        isLoading,
        isConnected,
        copiedStates,
        tableData,
        sendMessage,
        handleCopy: handleCopyWrapper,
        turnInProgress
    };
} 