import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { eventHandlerFactories } from './socketEvents';
import { maybeEndTurn } from './conversation';
import { handleCopy } from './clipboard';

export function useSocket(socket) {
    const [messages, setMessages] = useState([]);
    const [userMessage, setUserMessage] = useState('');
    const [threadId, setThreadId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [copiedStates, setCopiedStates] = useState({});
    const [tableData] = useState(new Map());
    
    // Configuration for message limits
    const MAX_MESSAGES = 500; // Maximum messages to keep in memory
    const CLEANUP_THRESHOLD = 600; // Clean up when exceeding this
    
    // Enhanced setMessages that manages memory by keeping only recent messages
    const setMessagesWithCleanup = useCallback((newMessages) => {
        if (typeof newMessages === 'function') {
            setMessages(prevMessages => {
                const updated = newMessages(prevMessages);
                if (updated.length > CLEANUP_THRESHOLD) {
                    // Keep only the most recent MAX_MESSAGES messages
                    return updated.slice(-MAX_MESSAGES);
                }
                return updated;
            });
        } else {
            // Direct array assignment
            if (newMessages.length > CLEANUP_THRESHOLD) {
                setMessages(newMessages.slice(-MAX_MESSAGES));
            } else {
                setMessages(newMessages);
            }
        }
    }, [MAX_MESSAGES, CLEANUP_THRESHOLD]);
    
    // Track the latest previous_response_id for multi-turn context
    const previousResponseId = useRef(null);
    const [turnInProgress, setTurnInProgress] = useState(false);
    // Track outstanding tool calls by call_id
    const outstandingToolCalls = useRef(new Set());
    // Track if conversation_end has been received for this turn
    const conversationEndReceived = useRef(false);

    // Add state to track web-search activity
    const [isWebSearchActive, setIsWebSearchActive] = useState(false);

    // Memoize the maybeEndTurn function
    const memoizedMaybeEndTurn = useCallback(() => {
        maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress });
    }, []);

    // --- Event Handlers (bound with state/refs) dynamically ---
    const deps = useMemo(() => ({
        setMessages: setMessagesWithCleanup,
        setTurnInProgress,
        setIsLoading,
        setIsConnected,
        setThreadId,
        socket,
        outstandingToolCalls,
        windowApi: (typeof window !== 'undefined' && window.api) || null,
        previousResponseId,
        conversationEndReceived,
        maybeEndTurn: memoizedMaybeEndTurn
    }), [
        setMessagesWithCleanup,
        setTurnInProgress,
        setIsLoading,
        setIsConnected,
        setThreadId,
        socket,
        memoizedMaybeEndTurn
    ]);

    const eventHandlers = useMemo(() => {
        return Object.fromEntries(
            Object.entries(eventHandlerFactories).map(([event, factory]) => [event, factory(deps)])
        );
    }, [deps]);

    // Memoize web search handlers
    const webSearchHandlers = useMemo(() => ({
        handleWebSearchCall: (data) => {
            if (data.toolCalls && Array.isArray(data.toolCalls) && data.toolCalls.some(tc => tc.name === 'web_search')) {
                setIsWebSearchActive(true);
            }
        },
        handleWebSearchResponse: (data) => {
            if (data.toolResponses && Array.isArray(data.toolResponses) && data.toolResponses.some(resp => resp.name === 'web_search')) {
                setIsWebSearchActive(false);
            }
        },
        clearWebSearch: () => {
            setIsWebSearchActive(false);
        }
    }), []);

    useEffect(() => {
        if (!socket) {
            return;
        }

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

        // Listen for web-search tool calls and clear events
        socket.on('tool_call_sent', webSearchHandlers.handleWebSearchCall);
        socket.on('tool_call_response', webSearchHandlers.handleWebSearchResponse);
        socket.on('message', webSearchHandlers.clearWebSearch);
        socket.on('answer_end', webSearchHandlers.clearWebSearch);

        return () => {
            // socket.off('tool_call_sent');
            Object.keys(eventHandlers).forEach(event => {
                socket.off(event, eventHandlers[event]);
            });
            if (socket.offAny) {
                socket.offAny();
            }
            socket.off('tool_call_sent', webSearchHandlers.handleWebSearchCall);
            socket.off('tool_call_response', webSearchHandlers.handleWebSearchResponse);
            socket.off('message', webSearchHandlers.clearWebSearch);
            socket.off('answer_end', webSearchHandlers.clearWebSearch);
        };
    }, [socket, eventHandlers, webSearchHandlers]);

    // --- User message sending logic ---
    const sendMessage = useCallback(async () => {
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
            setMessagesWithCleanup(prev => [...prev, {
                id: Date.now(),
                role: 'error',
                content: 'Failed to send message. Please try again.',
                status: 'completed'
            }]);
        }
    }, [userMessage, isConnected, turnInProgress, socket, setMessagesWithCleanup]);

    // --- Copy logic ---
    const handleCopyWrapper = useCallback((text, id) => handleCopy(text, id, setCopiedStates), []);

    return {
        messages,
        setMessages: setMessagesWithCleanup,
        userMessage,
        setUserMessage,
        threadId,
        isLoading,
        isConnected,
        copiedStates,
        tableData,
        sendMessage,
        handleCopy: handleCopyWrapper,
        turnInProgress,
        isWebSearchActive
    };
} 