import React, { useCallback, useMemo } from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';
import { Send, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';

export const InputArea = React.memo(function InputArea({ 
  userMessage, 
  setUserMessage, 
  onSendMessage, 
  socket, 
  isConnected, 
  isLoading, 
  turnInProgress 
}) {
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    onSendMessage();
  }, [onSendMessage]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  }, [onSendMessage]);

  const handleTextChange = useCallback((e) => {
    setUserMessage(e.target.value);
  }, [setUserMessage]);

  // Memoize derived state
  const { isDisabled, canSend, placeholder } = useMemo(() => {
    const disabled = !socket || !isConnected || isLoading || turnInProgress;
    const send = !disabled && userMessage.trim();
    const placeholderText = !socket 
      ? "AI chat requires backend server" 
      : isConnected 
        ? "Type a message..." 
        : "Connecting to server...";

    return {
      isDisabled: disabled,
      canSend: send,
      placeholder: placeholderText
    };
  }, [socket, isConnected, isLoading, turnInProgress, userMessage]);

  return (
    <div className="border-t p-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={userMessage}
          onChange={handleTextChange}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          disabled={isDisabled}
          className="flex-1 text-sm"
          textareaClassName="w-full"
          minRows={1}
          maxRows={6}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!canSend}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </Button>
      </form>
    </div>
  );
});

InputArea.propTypes = {
  userMessage: PropTypes.string.isRequired,
  setUserMessage: PropTypes.func.isRequired,
  onSendMessage: PropTypes.func.isRequired,
  socket: PropTypes.object,
  isConnected: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  turnInProgress: PropTypes.bool.isRequired
};