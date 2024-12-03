import OpenAI from 'openai';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import ASSISTANT_CONFIG from './config/assistantConfig.js';

dotenv.config();

// Event Handler for managing tool calls
class EventHandler extends EventEmitter {
  constructor(client, socket) {
    super();
    this.client = client;
    this.socket = socket;
    this.pendingToolCalls = new Map();
    this.currentMessageId = null;
    this.streamContent = '';
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

        case 'thread.run.requires_action':
          await this.handleRequiresAction(
            event.data,
            event.data.id,
            event.data.thread_id
          );
          break;

        case 'error':
          console.error('Stream error:', event.data);
          this.socket.emit('error', { message: 'Error in assistant stream' });
          break;
      }
    } catch (error) {
      console.error('Error handling event:', error);
      this.socket.emit('error', { message: 'Error handling assistant event' });
    }
  }

  async handleRequiresAction(data, runId, threadId) {
    try {
      const toolCalls = data.required_action.submit_tool_outputs.tool_calls;
      console.log('Tool calls received:', toolCalls);

      // Store the tool calls we're waiting for
      toolCalls.forEach(toolCall => {
        this.pendingToolCalls.set(toolCall.id, {
          runId,
          threadId,
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
      this.socket.once('tool_response', this.handleToolResponse.bind(this));
    } catch (error) {
      console.error('Error processing required action:', error);
      this.socket.emit('error', { message: 'Error processing tool calls' });
    }
  }

  async handleToolResponse(response) {
    try {
      const { toolCallId, output } = response;
      console.log('Tool response received:', toolCallId, output);

      const pendingCall = this.pendingToolCalls.get(toolCallId);
      if (!pendingCall) {
        console.warn('Received response for unknown tool call:', toolCallId);
        return;
      }

      // Mark this tool call as received and store the output
      pendingCall.received = true;
      pendingCall.output = output;

      // Check if all tool calls for this run have been received
      const { runId, threadId } = pendingCall;
      const allToolCallsReceived = Array.from(this.pendingToolCalls.values())
        .filter(call => call.runId === runId)
        .every(call => call.received);

      if (allToolCallsReceived) {
        // Prepare and submit all tool outputs for this run
        const toolOutputs = Array.from(this.pendingToolCalls.values())
          .filter(call => call.runId === runId)
          .map(call => ({
            tool_call_id: call.toolCall.id,
            output: call.output
          }));

        await this.submitToolOutputs(toolOutputs, runId, threadId);

        // Clean up the pending tool calls for this run
        Array.from(this.pendingToolCalls.entries())
          .filter(([_, call]) => call.runId === runId)
          .forEach(([id, _]) => this.pendingToolCalls.delete(id));
      }
    } catch (error) {
      console.error('Error handling tool response:', error);
      this.socket.emit('error', { message: 'Error handling tool response' });
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
  }

  async initialize() {
    try {
      this.assistant = await this.openai.beta.assistants.retrieve(ASSISTANT_CONFIG.assistant.id);
      
      // Update the assistant with the latest configuration
      this.assistant = await this.openai.beta.assistants.update(
        ASSISTANT_CONFIG.assistant.id,
        {
          name: ASSISTANT_CONFIG.assistant.assistantName,
          instructions: ASSISTANT_CONFIG.assistant.instructions,
          model: ASSISTANT_CONFIG.assistant.model,
          tools: ASSISTANT_CONFIG.assistant.tools
        }
      );
      return this.assistant;
    } catch (error) {
      if (error.status === 404) {
        console.warn(`No assistant found with id '${ASSISTANT_CONFIG.assistant.id}'. Creating a new one.`);
        this.assistant = await this.openai.beta.assistants.create({
          name: ASSISTANT_CONFIG.assistant.assistantName,
          instructions: ASSISTANT_CONFIG.assistant.instructions,
          model: ASSISTANT_CONFIG.assistant.model,
          tools: ASSISTANT_CONFIG.assistant.tools
        });
        console.log('New assistant created:', this.assistant.id);
        return this.assistant;
      }
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
      } else {
        thread = await this.openai.beta.threads.create();
        socket.emit('threadCreated', { threadId: thread.id });
      }

      await this.openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: userMessage
      });

      // Create event handler for this conversation
      const eventHandler = new EventHandler(this.openai, socket);
      eventHandler.on('event', eventHandler.onEvent.bind(eventHandler));

      // Start the run with streaming
      const stream = await this.openai.beta.threads.runs.stream(
        thread.id,
        {
          assistant_id: this.assistant.id,
        },
        eventHandler
      );

      // Process the stream
      for await (const event of stream) {
        eventHandler.emit('event', event);
      }

    } catch (error) {
      console.error('Error in sendMessage:', error);
      socket.emit('error', { message: 'Error processing message' });
      throw error;
    }
  }
}

export const assistantService = (openai) => new AssistantService(openai);
