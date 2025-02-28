import { Socket } from 'socket.io';
import { OpenAI } from 'openai';

// OpenAI Assistant related types
export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface AssistantConfigType {
  assistant: {
    id: string;
    model: string;
    assistantName: string;
    instructions: string;
  };
  tools: Tool[];
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface PendingToolCall {
  runId: string;
  threadId: string;
  toolCall: ToolCall;
  received: boolean;
  output: any;
}

export interface ToolResponse {
  toolCallId: string;
  output: any;
}

export interface RunEvent {
  event: string;
  data: any;  // Using any to accommodate OpenAI's event structure
}

export interface ToolOutput {
  tool_call_id: string;
  output: string;
}

// Socket message types
export interface Message {
  messageId?: string;
  role: 'assistant' | 'user';
  content: string;
  status?: 'started' | 'streaming' | 'completed';
}

export interface ThreadCreatedEvent {
  threadId: string;
}

export interface ErrorEvent {
  message: string;
}

export interface ToolCallEvent {
  toolCallId: string;
  name: string;
  arguments: any;
}

// Service interfaces
export interface AssistantServiceInterface {
  initialize(): Promise<any>;
  sendMessage(socket: Socket, userMessage: string, threadId: string | null): Promise<void>;
}

// Environment configuration
export interface EnvConfig {
  port: number;
  clientUrl: string;
  openaiApiKey: string;
  environment: 'development' | 'production' | 'test';
} 