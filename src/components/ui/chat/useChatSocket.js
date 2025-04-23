import { useState, useEffect, useRef } from 'react';
import { eventHandlerFactories } from './ChatSocketEventHandlers';
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

    // Add state to track web-search activity
    const [isWebSearchActive, setIsWebSearchActive] = useState(false);

    // --- Event Handlers (bound with state/refs) dynamically ---
    const deps = {
        setMessages,
        setTurnInProgress,
        setIsLoading,
        setIsConnected,
        setThreadId,
        socket,
        outstandingToolCalls,
        windowApi: window.api,
        previousResponseId,
        conversationEndReceived,
        maybeEndTurn: () => maybeEndTurn({ outstandingToolCalls, conversationEndReceived, setTurnInProgress })
    };
    const eventHandlers = Object.fromEntries(
        Object.entries(eventHandlerFactories).map(([event, factory]) => [event, factory(deps)])
    );

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

        // Listen for web-search tool calls and clear events
        const handleWebSearchCall = (data) => {
            if (data.toolCalls && Array.isArray(data.toolCalls) && data.toolCalls.some(tc => tc.name === 'web_search')) {
                setIsWebSearchActive(true);
            }
        };
        const handleWebSearchResponse = (data) => {
            if (data.toolResponses && Array.isArray(data.toolResponses) && data.toolResponses.some(resp => resp.name === 'web_search')) {
                setIsWebSearchActive(false);
            }
        };
        const clearWebSearch = () => {
            setIsWebSearchActive(false);
        };
        socket.on('tool_call_sent', handleWebSearchCall);
        socket.on('tool_call_response', handleWebSearchResponse);
        socket.on('message', clearWebSearch);
        socket.on('answer_end', clearWebSearch);

        return () => {
            // socket.off('tool_call_sent');
            Object.keys(eventHandlers).forEach(event => {
                socket.off(event, eventHandlers[event]);
            });
            if (socket.offAny) {
                socket.offAny();
            }
            socket.off('tool_call_sent', handleWebSearchCall);
            socket.off('tool_call_response', handleWebSearchResponse);
            socket.off('message', clearWebSearch);
            socket.off('answer_end', clearWebSearch);
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
        turnInProgress,
        isWebSearchActive
    };
} 