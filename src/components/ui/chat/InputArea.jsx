import React from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';
import { Send, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';

export function InputArea({ 
  userMessage, 
  setUserMessage, 
  onSendMessage, 
  socket, 
  isConnected, 
  isLoading, 
  turnInProgress 
}) {
  const handleSubmit = async (e) => {
    e.preventDefault();
    onSendMessage();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const isDisabled = !socket || !isConnected || isLoading || turnInProgress;
  const canSend = !isDisabled && userMessage.trim();

  return (
    <div className="border-t p-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={
            !socket 
              ? "AI chat requires backend server" 
              : isConnected 
                ? "Type a message..." 
                : "Connecting to server..."
          }
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
}

InputArea.propTypes = {
  userMessage: PropTypes.string.isRequired,
  setUserMessage: PropTypes.func.isRequired,
  onSendMessage: PropTypes.func.isRequired,
  socket: PropTypes.object,
  isConnected: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  turnInProgress: PropTypes.bool.isRequired
};