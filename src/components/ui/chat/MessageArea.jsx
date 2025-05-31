import React, { useRef, useEffect } from 'react';
import { ScrollArea } from '../scroll-area';
import { Loader2 } from 'lucide-react';
import MessageRouter from './MessageRouter';
import ConversationStarters from './ConversationStarters';
import { ConnectionIndicator } from './ConnectionIndicator';
import PropTypes from 'prop-types';
import Prism from 'prismjs';

export function MessageArea({ 
  messages, 
  socket, 
  isConnected, 
  isLoading,
  isWebSearchActive,
  copiedStates, 
  onCopy, 
  onSelectStarter,
  showChatLoader 
}) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
    Prism.highlightAll();
  }, [messages]);

  // Filter out tool_call_sent for runCodeInterpreter if result exists
  const filteredMessages = React.useMemo(() => {
    // Find all code_interpreter_result call_ids
    const codeInterpreterIds = new Set(
      messages
        .filter(m => m.type === 'code_interpreter_result' && m.id && m.id.endsWith('-ci'))
        .map(m => m.id.replace(/-ci$/, ''))
    );
    return messages.filter(m => {
      if (m.type === 'tool_call_sent' && m.toolName === 'runCodeInterpreter' && codeInterpreterIds.has(m.id)) {
        return false;
      }
      return true;
    });
  }, [messages]);

  return (
    <ScrollArea ref={scrollRef} className="flex-1 px-3 py-2">
      <div className="space-y-2 pr-2">
        <ConnectionIndicator 
          socket={socket} 
          isConnected={isConnected} 
          isWebSearchActive={isWebSearchActive} 
        />
        
        {/* Conversation Starters */}
        {socket && messages.length === 0 && isConnected && !isLoading && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-2">
              Try one of these to get started:
            </div>
            <div
              className="grid gap-3 grid-cols-1 sm:grid-cols-2"
              style={{ maxWidth: 400 }}
            >
              <ConversationStarters onSelect={onSelectStarter} />
            </div>
          </div>
        )}

        {/* Messages */}
        {filteredMessages.map((message, idx) => (
          <MessageRouter
            key={message.id || `msg-${idx}`}
            message={message}
            onCopy={onCopy}
            copiedStates={copiedStates}
          />
        ))}

        {/* Loading indicator */}
        {showChatLoader && (
          <div className="flex justify-start mb-2">
            <div className="bg-muted rounded-lg px-3 py-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

MessageArea.propTypes = {
  messages: PropTypes.array.isRequired,
  socket: PropTypes.object,
  isConnected: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  isWebSearchActive: PropTypes.bool.isRequired,
  copiedStates: PropTypes.object.isRequired,
  onCopy: PropTypes.func.isRequired,
  onSelectStarter: PropTypes.func.isRequired,
  showChatLoader: PropTypes.bool.isRequired
};