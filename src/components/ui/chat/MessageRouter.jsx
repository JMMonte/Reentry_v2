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
  
  if (eventType === 'code_interpreter_result' || eventType === 'tool_call_response') {
    return <CodeExecutionMessage message={message} />;
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