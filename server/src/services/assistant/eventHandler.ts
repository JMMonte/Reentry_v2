import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import { OpenAI } from 'openai';
import { RunEvent, ToolCall, ToolOutput, ToolResponse, PendingToolCall } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';
import { handleSocketError } from '../../utils/errors.js';
import { AssistantService } from './service.js';

const logger = createLogger('EventHandler');

/**
 * EventHandler for managing OpenAI Assistant events and tool calls
 */
export class EventHandler extends EventEmitter {
    private client: OpenAI;
    private socket: Socket;
    private assistantService: AssistantService;
    private pendingToolCalls: Map<string, PendingToolCall>;
    private currentMessageId: string | null;
    private streamContent: string;
    private currentRunId: string | null;
    private currentThreadId: string | null;
    private toolCallsCount: number;

    constructor(client: OpenAI, socket: Socket, assistantService: AssistantService) {
        super();
        this.client = client;
        this.socket = socket;
        this.assistantService = assistantService;
        this.pendingToolCalls = new Map();
        this.currentMessageId = null;
        this.streamContent = '';
        this.currentRunId = null;
        this.currentThreadId = null;
        this.toolCallsCount = 0;
    }

    async onEvent(event: RunEvent): Promise<void> {
        try {
            logger.debug('Event received:', event);

            switch (event.event) {
                case 'thread.message.created':
                    if (event.data.id) {
                        this.currentMessageId = event.data.id;
                        this.streamContent = '';
                        this.socket.emit('message', {
                            messageId: this.currentMessageId,
                            role: 'assistant',
                            content: '',
                            status: 'started'
                        });
                    }
                    break;

                case 'thread.message.delta':
                    if (event.data.delta?.content?.[0]?.text?.value) {
                        const deltaContent = event.data.delta.content[0].text.value;
                        this.streamContent += deltaContent;
                        this.socket.emit('message', {
                            messageId: this.currentMessageId,
                            role: 'assistant',
                            content: this.streamContent,
                            status: 'streaming'
                        });
                    }
                    break;

                case 'thread.message.completed':
                    this.socket.emit('message', {
                        messageId: this.currentMessageId,
                        role: 'assistant',
                        content: this.streamContent,
                        status: 'completed'
                    });
                    break;

                case 'thread.run.created':
                    if (event.data.id && event.data.thread_id) {
                        this.currentRunId = event.data.id;
                        this.currentThreadId = event.data.thread_id;
                        this.toolCallsCount = 0;
                    }
                    break;

                case 'thread.run.requires_action':
                    await this.handleRequiresAction(event.data);
                    break;

                case 'thread.run.completed':
                    // Clean up when run completes
                    if (event.data.thread_id && this.assistantService?.activeRuns) {
                        this.assistantService.activeRuns.delete(event.data.thread_id);
                    }
                    this.currentRunId = null;
                    this.currentThreadId = null;
                    this.toolCallsCount = 0;
                    break;

                case 'thread.run.failed':
                    logger.error('Run failed:', event.data.last_error);
                    if (event.data.thread_id && this.assistantService?.activeRuns) {
                        this.assistantService.activeRuns.delete(event.data.thread_id);
                    }
                    this.socket.emit('error', {
                        message: 'Assistant run failed: ' + (event.data.last_error?.message || 'Unknown error')
                    });
                    break;

                case 'error':
                    logger.error('Stream error:', event.data);
                    if (this.currentThreadId && this.assistantService?.activeRuns) {
                        this.assistantService.activeRuns.delete(this.currentThreadId);
                    }
                    this.socket.emit('error', { message: 'Error in assistant stream' });
                    break;
            }
        } catch (error) {
            logger.error('Error handling event:', error);
            handleSocketError(this.socket, error);
        }
    }

    async handleRequiresAction(data: RunEvent['data']): Promise<void> {
        try {
            if (!data.required_action) return;

            const toolCalls = data.required_action.submit_tool_outputs.tool_calls;
            logger.debug('Tool calls received:', toolCalls);

            this.toolCallsCount = toolCalls.length;
            const responses = new Map<string, ToolResponse>();

            // Set up the tool calls tracking
            toolCalls.forEach((toolCall: ToolCall) => {
                if (!data.id || !data.thread_id) return;

                this.pendingToolCalls.set(toolCall.id, {
                    runId: data.id,
                    threadId: data.thread_id,
                    toolCall,
                    received: false,
                    output: null
                });

                // Emit tool call to client
                this.socket.emit('tool_call', {
                    toolCallId: toolCall.id,
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments)
                });
            });

            // Set up one-time listener for tool responses
            const handleResponse = (response: ToolResponse) => {
                responses.set(response.toolCallId, response);

                // Check if we have all responses
                if (responses.size === this.toolCallsCount) {
                    // Process responses in the order of tool calls
                    const orderedOutputs = toolCalls.map((toolCall: ToolCall) => {
                        const response = responses.get(toolCall.id);
                        return {
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(response?.output || {})
                        };
                    });

                    // Submit all outputs at once
                    if (data.id && data.thread_id) {
                        this.submitToolOutputs(orderedOutputs, data.id, data.thread_id);
                    }
                } else {
                    // Continue listening for more responses
                    this.socket.once('tool_response', handleResponse);
                }
            };

            // Start listening for responses
            this.socket.once('tool_response', handleResponse);
        } catch (error) {
            logger.error('Error processing required action:', error);
            handleSocketError(this.socket, { message: 'Error processing tool calls' });
        }
    }

    async submitToolOutputs(toolOutputs: ToolOutput[], runId: string, threadId: string): Promise<void> {
        try {
            logger.debug('Submitting tool outputs:', toolOutputs);

            const stream = await this.client.beta.threads.runs.submitToolOutputsStream(
                threadId,
                runId,
                { tool_outputs: toolOutputs }
            );

            for await (const event of stream) {
                await this.onEvent(event);
            }
        } catch (error) {
            logger.error('Error submitting tool outputs:', error);
            handleSocketError(this.socket, { message: 'Error submitting tool outputs' });

            if (this.assistantService?.activeRuns) {
                this.assistantService.activeRuns.delete(threadId);
            }
        }
    }
} 