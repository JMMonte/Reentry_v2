import React from 'react';
import PropTypes from 'prop-types';
import { 
  UserMessage, 
  AssistantMessage, 
  ToolCallMessage, 
  CodeExecutionMessage, 
  ErrorMessage 
} from './messages';

export default function MessageRouter({ message, onCopy, copiedStates = {} }) {
  // Determine message type and role
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';
  const isError = message.role === 'error' || message.type === 'error';
  const eventType = message.type || message.role;
  
  // Check if message is currently streaming (this could be enhanced with actual streaming detection)
  const isStreaming = message.status === 'streaming' || message.streaming;

  // Route to appropriate message component based on type
  if (isUser) {
    return <UserMessage message={message} />;
  }
  
  if (isError) {
    return <ErrorMessage message={message} isStreaming={isStreaming} />;
  }
  
  if (eventType === 'tool_call_sent') {
    return <ToolCallMessage message={message} isStreaming={isStreaming} />;
  }
  
  if (eventType === 'code_interpreter_result') {
    return <CodeExecutionMessage message={message} />;
  }
  
  if (eventType === 'tool_call_response') {
    // Check if this is actually a code interpreter result
    const toolResponse = message.toolResponses?.[0];
    const isCodeInterpreter = toolResponse?.name === 'runCodeInterpreter' || 
                             toolResponse?.name === 'code_interpreter';
    
    if (isCodeInterpreter) {
      // Route to CodeExecutionMessage for code interpreter results
      return <CodeExecutionMessage message={message} />;
    } else {
      // For other tool responses, show as a regular tool message with result
      return <ToolCallMessage message={{
        ...message,
        toolName: toolResponse?.name || 'Tool Result',
        status: 'done'
      }} />;
    }
  }
  
  if (isAssistant || eventType === 'message') {
    return (
      <AssistantMessage 
        message={message} 
        onCopy={onCopy} 
        isStreaming={isStreaming} 
      />
    );
  }
  
  if (isTool) {
    return <ToolCallMessage message={message} isStreaming={isStreaming} />;
  }
  
  // Fallback for unknown message types - render as assistant message
  return (
    <AssistantMessage 
      message={message} 
      onCopy={onCopy} 
      isStreaming={isStreaming} 
    />
  );
}

MessageRouter.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    role: PropTypes.string,
    type: PropTypes.string,
    content: PropTypes.string,
    status: PropTypes.string,
    streaming: PropTypes.bool
  }).isRequired,
  onCopy: PropTypes.func,
  copiedStates: PropTypes.object
};