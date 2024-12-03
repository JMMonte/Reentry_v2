import OpenAI from 'openai';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import ASSISTANT_CONFIG from './config/assistantConfig.js';

dotenv.config();

// Event Handler for managing tool calls
class EventHandler extends EventEmitter {
  constructor(client, socket, assistantService) {
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

  async onEvent(event) {
    try {
      console.log('Event received:', event.event, event);
      
      switch (event.event) {
        case 'thread.message.created':
          this.currentMessageId = event.data.id;
          this.streamContent = '';
          this.socket.emit('message', {
            messageId: this.currentMessageId,
            role: 'assistant',
            content: '',
            status: 'started'
          });
          break;

        case 'thread.message.delta':
          if (event.data.delta.content?.[0]?.text?.value) {
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
          this.currentRunId = event.data.id;
          this.currentThreadId = event.data.thread_id;
          this.toolCallsCount = 0;
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
          console.error('Run failed:', event.data.last_error);
          if (event.data.thread_id && this.assistantService?.activeRuns) {
            this.assistantService.activeRuns.delete(event.data.thread_id);
          }
          this.socket.emit('error', { 
            message: 'Assistant run failed: ' + (event.data.last_error?.message || 'Unknown error')
          });
          break;

        case 'error':
          console.error('Stream error:', event.data);
          if (this.currentThreadId && this.assistantService?.activeRuns) {
            this.assistantService.activeRuns.delete(this.currentThreadId);
          }
          this.socket.emit('error', { message: 'Error in assistant stream' });
          break;
      }
    } catch (error) {
      console.error('Error handling event:', error);
      this.socket.emit('error', { message: 'Error handling assistant event' });
    }
  }

  async handleRequiresAction(data) {
    try {
      const toolCalls = data.required_action.submit_tool_outputs.tool_calls;
      console.log('Tool calls received:', toolCalls);

      this.toolCallsCount = toolCalls.length;
      const responses = new Map();

      // Set up the tool calls tracking
      toolCalls.forEach(toolCall => {
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
      const handleResponse = (response) => {
        responses.set(response.toolCallId, response);
        
        // Check if we have all responses
        if (responses.size === this.toolCallsCount) {
          // Process responses in the order of tool calls
          const orderedOutputs = toolCalls.map(toolCall => {
            const response = responses.get(toolCall.id);
            return {
              tool_call_id: toolCall.id,
              output: JSON.stringify(response.output)
            };
          });

          // Submit all outputs at once
          this.submitToolOutputs(orderedOutputs, data.id, data.thread_id);
        } else {
          // Continue listening for more responses
          this.socket.once('tool_response', handleResponse);
        }
      };

      // Start listening for responses
      this.socket.once('tool_response', handleResponse);
    } catch (error) {
      console.error('Error processing required action:', error);
      this.socket.emit('error', { message: 'Error processing tool calls' });
    }
  }

  async submitToolOutputs(toolOutputs, runId, threadId) {
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
      console.error('Error submitting tool outputs:', error);
      this.socket.emit('error', { message: 'Error submitting tool outputs' });
      
      if (this.assistantService?.activeRuns) {
        this.assistantService.activeRuns.delete(threadId);
      }
    }
  }
}

class AssistantService {
  constructor(openai) {
    if (!openai) {
      throw new Error('OpenAI client is required');
    }
    this.openai = openai;
    this.assistant = null;
    this.activeRuns = new Map(); // Track active runs by threadId
  }

  async initialize() {
    try {
      let assistantExists = true;
      try {
        this.assistant = await this.openai.beta.assistants.retrieve(ASSISTANT_CONFIG.assistant.id);
      } catch (retrieveError) {
        if (retrieveError.status === 404) {
          assistantExists = false;
        } else {
          throw retrieveError;
        }
      }

      const assistantConfig = {
        name: ASSISTANT_CONFIG.assistant.assistantName,
        instructions: ASSISTANT_CONFIG.assistant.instructions,
        model: ASSISTANT_CONFIG.assistant.model,
        tools: ASSISTANT_CONFIG.assistant.tools
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

  async sendMessage(socket, userMessage, threadId = null) {
    try {
      if (!this.assistant) {
        await this.initialize();
      }

      let thread;
      if (threadId) {
        thread = await this.openai.beta.threads.retrieve(threadId);
        
        // Check if there's an active run for this thread
        if (this.activeRuns.has(thread.id)) {
          const activeRun = this.activeRuns.get(thread.id);
          try {
            const runStatus = await this.openai.beta.threads.runs.retrieve(
              thread.id,
              activeRun
            );
            
            if (['in_progress', 'requires_action'].includes(runStatus.status)) {
              socket.emit('error', { 
                message: 'Please wait for the previous action to complete before sending a new message'
              });
              return;
            }
          } catch (error) {
            // If we can't retrieve the run, assume it's no longer active
            console.log('Could not retrieve run status, cleaning up:', error);
            this.activeRuns.delete(thread.id);
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

      // Create event handler for this conversation and pass 'this' as assistantService
      const eventHandler = new EventHandler(this.openai, socket, this);
      eventHandler.on('event', eventHandler.onEvent.bind(eventHandler));

      // Start the run with streaming
      const stream = await this.openai.beta.threads.runs.stream(
        thread.id,
        {
          assistant_id: this.assistant.id,
        },
        eventHandler
      );

      // Store the active run
      const runId = stream.runId;
      this.activeRuns.set(thread.id, runId);
      console.log(`Started run ${runId} for thread ${thread.id}`);

      // Process the stream
      for await (const event of stream) {
        eventHandler.emit('event', event);
      }

      // Clean up completed run
      this.activeRuns.delete(thread.id);
      console.log(`Completed run ${runId} for thread ${thread.id}`);

    } catch (error) {
      console.error('Error in sendMessage:', error);
      socket.emit('error', { message: 'Error processing message' });
      throw error;
    }
  }
}

export const assistantService = (openai) => new AssistantService(openai);
