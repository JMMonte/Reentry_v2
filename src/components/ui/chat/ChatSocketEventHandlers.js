// ChatSocketEventHandlers.js
// Contains all event handler functions for useChatSocket

export function handleConversationStart({ setMessages, setTurnInProgress }) {
    return (data) => {
        setMessages(prev => [
            ...prev,
            {
                id: `conv-${data.timestamp}`,
                role: 'user',
                type: 'conversation_start',
                content: data.userMessage,
                status: 'started',
                timestamp: data.timestamp
            }
        ]);
        setTurnInProgress(true);
    };
}

export function handleAnswerStart({ setMessages, setIsLoading }) {
    return (data) => {
        setMessages(prev => [
            ...prev,
            {
                id: `answer-${data.timestamp}`,
                role: 'assistant',
                type: 'answer_start',
                content: data.content || '',
                status: 'streaming',
                timestamp: data.timestamp
            }
        ]);
        setIsLoading(true);
    };
}

export function handleMessage({ setMessages, setIsLoading }) {
    return (data) => {
        setMessages(prev => {
            const idx = [...prev].reverse().findIndex(m => m.role === 'assistant' && m.status === 'streaming');
            if (idx !== -1) {
                const realIdx = prev.length - 1 - idx;
                const updated = [...prev];
                updated[realIdx] = {
                    ...updated[realIdx],
                    content: data.content || '',
                    status: data.status,
                    type: 'message'
                };
                return updated;
            } else {
                return [
                    ...prev,
                    {
                        id: `answer-${Date.now()}`,
                        role: 'assistant',
                        type: 'message',
                        content: data.content,
                        status: data.status
                    }
                ];
            }
        });
        if (data.status === 'completed') {
            setIsLoading(false);
        }
    };
}

export function handleAnswerEnd({ setMessages, setIsLoading, previousResponseId }) {
    return (data) => {
        setMessages(prev => {
            const idx = [...prev].reverse().findIndex(m => m.role === 'assistant');
            if (idx !== -1) {
                const realIdx = prev.length - 1 - idx;
                const updated = [...prev];
                updated[realIdx] = {
                    ...updated[realIdx],
                    content: data.content,
                    status: 'completed',
                    type: 'answer_end',
                    timestamp: data.timestamp
                };
                return updated;
            } else {
                return [
                    ...prev,
                    {
                        id: `answer-${data.timestamp}`,
                        role: 'assistant',
                        type: 'answer_end',
                        content: data.content,
                        status: 'completed',
                        timestamp: data.timestamp
                    }
                ];
            }
        });
        setIsLoading(false);
        if (data.id) {
            previousResponseId.current = data.id;
        }
    };
}

export function handleConversationEnd({ setMessages, conversationEndReceived, maybeEndTurn }) {
    return (data) => {
        setMessages(prev => [
            ...prev,
            {
                id: `conv_end-${data.timestamp}`,
                role: 'system',
                type: 'conversation_end',
                userMessage: data.userMessage,
                content: '',
                timestamp: data.timestamp
            }
        ]);
        conversationEndReceived.current = true;
        maybeEndTurn();
    };
}

export function handleToolCallSent({ setMessages, socket, outstandingToolCalls, windowApi }) {
    return (data) => {
        data.toolCalls.forEach(toolCall => {
            const { call_id: toolCallId, name, arguments: args } = toolCall;
            // console.log('[TOOL CALL RECEIVED]', { toolCallId, name, args });
            setMessages(prev => [
                ...prev,
                {
                    id: toolCallId,
                    role: 'tool',
                    type: 'tool_call_sent',
                    toolName: name,
                    content: `Tool \`${name}\` called...`,
                    status: 'called',
                    arguments: args,
                    timestamp: data.timestamp
                }
            ]);
            (async () => {
                try {
                    if (!windowApi || typeof windowApi[name] !== 'function') {
                        throw new Error(`No API function for tool: ${name}`);
                    }
                    let parsedArgs;
                    try {
                        parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                        // console.log('[TOOL CALL PARSED ARGS]', { toolCallId, name, parsedArgs });
                        if (!parsedArgs || typeof parsedArgs !== 'object') {
                            throw new Error('Tool call arguments are missing or invalid');
                        }
                    } catch {
                        // console.error('[TOOL CALL ARGUMENTS ERROR]', { toolCallId, name, args, error: err });
                        socket.emit('tool_response', [{ call_id: toolCallId, output: { error: 'Invalid arguments JSON or missing arguments' } }]);
                        return;
                    }
                    if (name === 'runCodeInterpreter' && parsedArgs.files && Array.isArray(parsedArgs.files)) {
                        parsedArgs = {
                            ...parsedArgs,
                            files: parsedArgs.files.map(file => {
                                if (file.data && typeof file.data !== 'string') {
                                    try {
                                        return {
                                            ...file,
                                            data: btoa(
                                                typeof file.data === 'object' && file.data instanceof Uint8Array
                                                    ? String.fromCharCode.apply(null, file.data)
                                                    : String(file.data)
                                            )
                                        };
                                    } catch {
                                        return { ...file, data: '' };
                                    }
                                }
                                return file;
                            })
                        };
                    }
                    if (name === 'createSatelliteFromOrbitalElements' && parsedArgs) {
                        const getVal = (keys) => {
                            for (const key of keys) {
                                if (parsedArgs[key] != null) return parsedArgs[key];
                            }
                            return undefined;
                        };
                        const parseNum = (v) => typeof v === 'string' ? parseFloat(v) : v;
                        const semiMajorAxisRaw = getVal(['semiMajorAxis', 'SMA', 'sma', 'a']);
                        const eccentricityRaw = getVal(['eccentricity', 'Ecc', 'ecc', 'e']);
                        const inclinationRaw = getVal(['inclination', 'Inc', 'i']);
                        const raanRaw = getVal(['raan', 'LAN', 'lan', 'longitudeOfAscendingNode']);
                        const argumentOfPeriapsisRaw = getVal(['argumentOfPeriapsis', 'AoP', 'argPer', 'w']);
                        const trueAnomalyRaw = getVal(['trueAnomaly', 'TA', 'f', 'theta']);
                        const massRaw = parsedArgs.mass;
                        const sizeRaw = parsedArgs.size;
                        const nameRaw = parsedArgs.name;
                        parsedArgs = {
                            semiMajorAxis: parseNum(semiMajorAxisRaw),
                            eccentricity: parseNum(eccentricityRaw),
                            inclination: parseNum(inclinationRaw),
                            raan: parseNum(raanRaw),
                            argumentOfPeriapsis: parseNum(argumentOfPeriapsisRaw),
                            trueAnomaly: parseNum(trueAnomalyRaw),
                            ...(massRaw != null ? { mass: parseNum(massRaw) } : {}),
                            ...(sizeRaw != null ? { size: parseNum(sizeRaw) } : {}),
                            ...(nameRaw != null ? { name: nameRaw } : {}),
                        };
                    }
                    const output = await windowApi[name](parsedArgs);
                    socket.emit('tool_response', [{ call_id: toolCallId, name, output }]);
                    outstandingToolCalls.current.add(toolCallId);
                } catch (err) {
                    // console.error('[TOOL CALL EXECUTION ERROR]', { toolCallId, name, error: err });
                    socket.emit('tool_response', [{ call_id: toolCallId, name, output: { error: err.message } }]);
                }
            })();
        });
    };
}

export function handleToolCallResponse({ setMessages, outstandingToolCalls, maybeEndTurn }) {
    return (data) => {
        if (!data || !Array.isArray(data.toolResponses)) return;
        setMessages(prev => {
            let updated = [...prev];
            data.toolResponses.forEach(resp => {
                if (resp.name === 'runCodeInterpreter') {
                    if (resp.call_id) {
                        outstandingToolCalls.current.delete(resp.call_id);
                    }
                    return;
                }
                const idx = updated.findIndex(m => m.id === resp.call_id && m.role === 'tool');
                if (idx !== -1) {
                    updated[idx] = {
                        ...updated[idx],
                        type: 'tool_call_response',
                        status: 'done',
                        toolResponses: [resp],
                        content: typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output)
                    };
                } else {
                    updated.push({
                        id: resp.call_id,
                        role: 'tool',
                        type: 'tool_call_response',
                        status: 'done',
                        toolResponses: [resp],
                        content: typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output)
                    });
                }
                if (resp.call_id) {
                    outstandingToolCalls.current.delete(resp.call_id);
                }
            });
            return updated;
        });
        maybeEndTurn();
    };
}

export function handleError({ setIsLoading, setMessages }) {
    return (error) => {
        setIsLoading(false);
        if (error && error.code === 'TOOL_RESPONSE_TIMEOUT') {
            setMessages(prev => [...prev, {
                id: Date.now(),
                role: 'error',
                type: 'error',
                code: error.code,
                content: 'Tool call timed out. The tool did not respond in time. Please try again or check your tool implementation.',
                status: 'completed'
            }]);
            return;
        }
        setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'error',
            type: 'error',
            content: error.message || error,
            status: 'completed'
        }]);
    };
}

export function handleThreadCreated({ setThreadId }) {
    return (data) => {
        setThreadId(data.threadId);
    };
}

export function handleRunCompleted({ setIsLoading }) {
    return () => {
        setIsLoading(false);
    };
}

export function handleConnect({ setIsConnected }) {
    return () => {
        setIsConnected(true);
    };
}

export function handleDisconnect({ setIsConnected, setIsLoading }) {
    return () => {
        setIsConnected(false);
        setIsLoading(false);
    };
}

export const eventHandlerFactories = {
    conversation_start: handleConversationStart,
    answer_start: handleAnswerStart,
    message: handleMessage,
    answer_end: handleAnswerEnd,
    conversation_end: handleConversationEnd,
    tool_call_sent: handleToolCallSent,
    tool_call_response: handleToolCallResponse,
    error: handleError,
    threadCreated: handleThreadCreated,
    runCompleted: handleRunCompleted,
    connect: handleConnect,
    disconnect: handleDisconnect
}; 