import OpenAI from 'openai';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import ASSISTANT_CONFIG from './config/assistantConfig.js';

dotenv.config();

interface PendingToolCall {
    runId: string;
    threadId: string;
    toolCall: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall;
    received: boolean;
    output: any;
}

interface ToolResponse {
    toolCallId: string;
    output: any;
}

interface AssistantStreamEvent {
    event: string;
    data: any;
}

// Centralized state management
class AssistantState {
    messageId: string | null;
    streamContent: string;
    runId: string | null;
    threadId: string | null;
    toolCallsCount: number;
    pendingToolCalls: Map<string, PendingToolCall>;
    activeRuns: Map<string, string>;

    constructor() {
        this.messageId = null;
        this.streamContent = '';
        this.runId = null;
        this.threadId = null;
        this.toolCallsCount = 0;
        this.pendingToolCalls = new Map();
        this.activeRuns = new Map();
    }

    reset(): void {
        this.messageId = null;
        this.streamContent = '';
        this.runId = null;
        this.threadId = null;
        this.toolCallsCount = 0;
    }

    cleanupRun(threadId: string | null): void {
        if (threadId) {
            this.activeRuns.delete(threadId);
        }
        this.reset();
    }
}

// Event Handler for managing tool calls
class EventHandler extends EventEmitter {
    private client: OpenAI;
    private socket: Socket;
    private assistantService: AssistantService;
    private state: AssistantState;

    constructor(client: OpenAI, socket: Socket, assistantService: AssistantService) {
        super();
        this.client = client;
        this.socket = socket;
        this.assistantService = assistantService;
        this.state = assistantService.state;
    }

    private emitMessage(content: string, status: string): void {
        this.socket.emit('message', {
            messageId: this.state.messageId,
            role: 'assistant',
            content,
            status
        });
    }

    private handleError(error: Error, context: string): void {
        console.error(`Error in ${context}:`, error);
        this.state.cleanupRun(this.state.threadId);
        this.socket.emit('error', { message: `Error in ${context}` });
    }

    async onEvent(event: AssistantStreamEvent): Promise<void> {
        try {
            console.log('Event received:', event.event, event);

            switch (event.event) {
                case 'thread.message.created':
                    this.handleMessageCreated(event.data);
                    break;

                case 'thread.message.delta':
                    this.handleMessageDelta(event.data);
                    break;

                case 'thread.message.completed':
                    this.handleMessageCompleted();
                    break;

                case 'thread.run.created':
                    this.handleRunCreated(event.data);
                    break;

                case 'thread.run.requires_action':
                    await this.handleRequiresAction(event.data);
                    break;

                case 'thread.run.completed':
                    this.handleRunCompleted(event.data);
                    break;

                case 'thread.run.failed':
                    this.handleRunFailed(event.data);
                    break;

                case 'error':
                    this.handleStreamError(event.data);
                    break;
            }
        } catch (error) {
            this.handleError(error as Error, 'event handling');
        }
    }

    private handleMessageCreated(data: any): void {
        this.state.messageId = data.id;
        this.state.streamContent = '';
        this.emitMessage('', 'started');
    }

    private handleMessageDelta(data: any): void {
        if (data.delta.content?.[0]?.text?.value) {
            this.state.streamContent += data.delta.content[0].text.value;
            this.emitMessage(this.state.streamContent, 'streaming');
        }
    }

    private handleMessageCompleted(): void {
        this.emitMessage(this.state.streamContent, 'completed');
    }

    private handleRunCreated(data: any): void {
        this.state.runId = data.id;
        this.state.threadId = data.thread_id;
        this.state.toolCallsCount = 0;
    }

    private handleRunCompleted(data: any): void {
        this.state.cleanupRun(data.thread_id);
    }

    private handleRunFailed(data: any): void {
        console.error('Run failed:', data.last_error);
        this.state.cleanupRun(data.thread_id);
        this.socket.emit('error', {
            message: 'Assistant run failed: ' + (data.last_error?.message || 'Unknown error')
        });
    }

    private handleStreamError(data: any): void {
        console.error('Stream error:', data);
        this.state.cleanupRun(this.state.threadId);
        this.socket.emit('error', { message: 'Error in assistant stream' });
    }

    private async handleRequiresAction(data: any): Promise<void> {
        try {
            const toolCalls: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[] = data.required_action.submit_tool_outputs.tool_calls;
            console.log('Tool calls received:', toolCalls);

            this.state.toolCallsCount = toolCalls.length;
            const responses = new Map<string, ToolResponse>();

            toolCalls.forEach((toolCall: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall) => {
                this.state.pendingToolCalls.set(toolCall.id, {
                    runId: data.id,
                    threadId: data.thread_id,
                    toolCall,
                    received: false,
                    output: null
                });

                this.socket.emit('tool_call', {
                    toolCallId: toolCall.id,
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments)
                });
            });

            const handleResponse = (response: ToolResponse) => {
                responses.set(response.toolCallId, response);

                if (responses.size === this.state.toolCallsCount) {
                    const orderedOutputs = toolCalls.map(toolCall => ({
                        tool_call_id: toolCall.id,
                        output: JSON.stringify(responses.get(toolCall.id)?.output)
                    }));

                    this.submitToolOutputs(orderedOutputs, data.id, data.thread_id);
                } else {
                    this.socket.once('tool_response', handleResponse);
                }
            };

            this.socket.once('tool_response', handleResponse);
        } catch (error) {
            this.handleError(error as Error, 'processing tool calls');
        }
    }

    private async submitToolOutputs(toolOutputs: Array<{ tool_call_id: string; output: string }>, runId: string, threadId: string): Promise<void> {
        try {
            console.log('Submitting tool outputs:', toolOutputs);

            const stream = await this.client.beta.threads.runs.submitToolOutputsStream(
                threadId,
                runId,
                { tool_outputs: toolOutputs }
            );

            for await (const event of stream) {
                await this.onEvent(event);
            }
        } catch (error) {
            this.handleError(error as Error, 'submitting tool outputs');
        }
    }
}

interface AssistantConfig {
    name: string;
    instructions: string;
    model: string;
    tools: any[];
}

class AssistantService {
    private openai: OpenAI;
    private assistant: OpenAI.Beta.Assistants.Assistant | null;
    state: AssistantState;

    constructor(openai: OpenAI) {
        if (!openai) {
            throw new Error('OpenAI client is required');
        }
        this.openai = openai;
        this.assistant = null;
        this.state = new AssistantState();
    }

    async initialize(): Promise<OpenAI.Beta.Assistants.Assistant> {
        try {
            let assistantExists = true;
            try {
                this.assistant = await this.openai.beta.assistants.retrieve(ASSISTANT_CONFIG.assistant.id);
            } catch (retrieveError: any) {
                if (retrieveError.status === 404) {
                    assistantExists = false;
                } else {
                    throw retrieveError;
                }
            }

            const assistantConfig: AssistantConfig = {
                name: ASSISTANT_CONFIG.assistant.assistantName,
                instructions: ASSISTANT_CONFIG.assistant.instructions,
                model: ASSISTANT_CONFIG.assistant.model,
                tools: ASSISTANT_CONFIG.tools
            };

            if (assistantExists) {
                this.assistant = await this.openai.beta.assistants.update(
                    ASSISTANT_CONFIG.assistant.id,
                    assistantConfig
                );
                console.log('Assistant updated:', this.assistant.id);
            } else {
                this.assistant = await this.openai.beta.assistants.create(assistantConfig);
                console.log('New assistant created:', this.assistant.id);
            }

            return this.assistant;
        } catch (error) {
            console.error('Error initializing assistant:', error);
            throw error;
        }
    }

    async sendMessage(socket: Socket, userMessage: string, threadId: string | null = null): Promise<void> {
        try {
            if (!this.assistant) {
                await this.initialize();
            }

            let thread;
            if (threadId) {
                thread = await this.openai.beta.threads.retrieve(threadId);

                if (this.state.activeRuns.has(thread.id)) {
                    const activeRun = this.state.activeRuns.get(thread.id);
                    try {
                        const runStatus = await this.openai.beta.threads.runs.retrieve(
                            thread.id,
                            activeRun!
                        );

                        if (['in_progress', 'requires_action'].includes(runStatus.status)) {
                            socket.emit('error', {
                                message: 'Please wait for the previous action to complete before sending a new message'
                            });
                            return;
                        }
                    } catch (error) {
                        console.log('Could not retrieve run status, cleaning up:', error);
                        this.state.activeRuns.delete(thread.id);
                    }
                }
            } else {
                thread = await this.openai.beta.threads.create();
                socket.emit('threadCreated', { threadId: thread.id });
            }

            await this.openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: userMessage
            });

            const eventHandler = new EventHandler(this.openai, socket, this);
            eventHandler.on('event', eventHandler.onEvent.bind(eventHandler));

            const stream = await this.openai.beta.threads.runs.stream(
                thread.id,
                {
                    assistant_id: this.assistant!.id,
                }
            );

            const runId = (stream as any).runId;
            this.state.activeRuns.set(thread.id, runId);
            console.log(`Started run ${runId} for thread ${thread.id}`);

            for await (const event of stream) {
                eventHandler.emit('event', event);
            }

            this.state.activeRuns.delete(thread.id);
            console.log(`Completed run ${runId} for thread ${thread.id}`);

        } catch (error) {
            console.error('Error in sendMessage:', error);
            socket.emit('error', { message: 'Error processing message' });
            throw error;
        }
    }
}

export const assistantService = (openai: OpenAI): AssistantService => new AssistantService(openai); 