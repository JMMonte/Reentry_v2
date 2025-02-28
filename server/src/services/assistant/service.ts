import { OpenAI } from 'openai';
import { Socket } from 'socket.io';
import ASSISTANT_CONFIG from '../../config/assistant.js';
import { AssistantServiceInterface } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';
import { handleSocketError } from '../../utils/errors.js';
import { EventHandler } from './eventHandler.js';

const logger = createLogger('AssistantService');

/**
 * Service for managing OpenAI Assistant interactions
 */
export class AssistantService implements AssistantServiceInterface {
    private openai: OpenAI;
    private assistant: any; // Using any for OpenAI's assistant types
    public activeRuns: Map<string, string>; // threadId -> runId mapping

    constructor(openai: OpenAI) {
        if (!openai) {
            throw new Error('OpenAI client is required');
        }
        this.openai = openai;
        this.assistant = null;
        this.activeRuns = new Map(); // Track active runs by threadId
    }

    /**
     * Initialize and configure the OpenAI Assistant
     */
    async initialize(): Promise<any> {
        try {
            let assistantExists = true;
            try {
                this.assistant = await this.openai.beta.assistants.retrieve(ASSISTANT_CONFIG.assistant.id);
                logger.info('Assistant retrieved');
            } catch (retrieveError: any) {
                if (retrieveError.status === 404) {
                    assistantExists = false;
                    logger.info('Assistant not found, creating new one');
                } else {
                    throw retrieveError;
                }
            }

            // Cast config.tools to any to bypass TypeScript's strict checking
            const assistantConfig = {
                name: ASSISTANT_CONFIG.assistant.assistantName,
                instructions: ASSISTANT_CONFIG.assistant.instructions,
                model: ASSISTANT_CONFIG.assistant.model,
                tools: ASSISTANT_CONFIG.tools as any
            };

            if (assistantExists) {
                this.assistant = await this.openai.beta.assistants.update(
                    ASSISTANT_CONFIG.assistant.id,
                    assistantConfig
                );
                logger.info(`Assistant updated: ${this.assistant.id}`);
            } else {
                this.assistant = await this.openai.beta.assistants.create(assistantConfig);
                logger.info(`New assistant created: ${this.assistant.id}`);
            }

            return this.assistant;
        } catch (error) {
            logger.error('Error initializing assistant:', error);
            throw error;
        }
    }

    /**
     * Send a message to the OpenAI Assistant and stream the response
     * @param socket Socket to emit events to
     * @param userMessage Message from the user
     * @param threadId Optional thread ID for continuing a conversation
     */
    async sendMessage(socket: Socket, userMessage: string, threadId: string | null = null): Promise<void> {
        try {
            if (!this.assistant) {
                await this.initialize();
            }

            let thread;
            if (threadId) {
                thread = await this.openai.beta.threads.retrieve(threadId);
                logger.debug(`Using existing thread: ${threadId}`);

                // Check if there's an active run for this thread
                if (this.activeRuns.has(thread.id)) {
                    const activeRun = this.activeRuns.get(thread.id);
                    try {
                        if (activeRun) {
                            const runStatus = await this.openai.beta.threads.runs.retrieve(
                                thread.id,
                                activeRun
                            );

                            if (['in_progress', 'requires_action'].includes(runStatus.status)) {
                                logger.warn(`Thread ${thread.id} has an active run, rejecting new message`);
                                socket.emit('error', {
                                    message: 'Please wait for the previous action to complete before sending a new message'
                                });
                                return;
                            }
                        }
                    } catch (error) {
                        // If we can't retrieve the run, assume it's no longer active
                        logger.warn(`Could not retrieve run status, cleaning up: ${error}`);
                        this.activeRuns.delete(thread.id);
                    }
                }
            } else {
                thread = await this.openai.beta.threads.create();
                logger.info(`Created new thread: ${thread.id}`);
                socket.emit('threadCreated', { threadId: thread.id });
            }

            // Add user message to thread
            await this.openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: userMessage
            });
            logger.debug(`Added user message to thread ${thread.id}`);

            // Create event handler for this conversation and pass 'this' as assistantService
            const eventHandler = new EventHandler(this.openai, socket, this);
            eventHandler.on('event', eventHandler.onEvent.bind(eventHandler));

            // Start the run with streaming
            const stream = await this.openai.beta.threads.runs.stream(
                thread.id,
                {
                    assistant_id: this.assistant.id,
                },
                // @ts-ignore - OpenAI SDK types are incompatible, but works at runtime
                eventHandler
            );

            // Store the active run
            // @ts-ignore - runId exists on stream but is not in the type definitions
            const runId = stream.runId;
            this.activeRuns.set(thread.id, runId);
            logger.info(`Started run ${runId} for thread ${thread.id}`);

            // Process the stream
            for await (const event of stream) {
                eventHandler.emit('event', event);
            }

            // Clean up completed run
            this.activeRuns.delete(thread.id);
            logger.info(`Completed run ${runId} for thread ${thread.id}`);

        } catch (error) {
            logger.error('Error in sendMessage:', error);
            handleSocketError(socket, { message: 'Error processing message' });
            throw error;
        }
    }
}

/**
 * Factory function to create an AssistantService instance
 * @param openai OpenAI client instance
 * @returns AssistantService instance
 */
export const createAssistantService = (openai: OpenAI): AssistantService => {
    return new AssistantService(openai);
}; 