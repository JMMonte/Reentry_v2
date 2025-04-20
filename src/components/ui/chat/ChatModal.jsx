import React, { useRef } from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';
import { Send, Loader2 } from 'lucide-react';
import { ScrollArea } from '../scroll-area';
import { DraggableModal } from '../modal/DraggableModal';
import { marked } from 'marked';
import Prism from 'prismjs';
import { DataTable } from '../table/DataTable';
import { createRoot } from 'react-dom/client';
import PropTypes from 'prop-types';
import ChatMessage from './ChatMessage';
import ChatStarters from './ChatStarters';
import { useChatSocket } from './useChatSocket';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false,
  highlight: function (code, lang) {
    if (Prism.languages[lang]) {
      try {
        return Prism.highlight(code, Prism.languages[lang], lang);
      } catch (e) {
        console.error('Prism highlighting error:', e);
        return code;
      }
    }
    return code;
  }
});

export function ChatModal({ isOpen, onClose, socket, modalPosition }) {
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const {
    messages,
    setMessages,
    userMessage,
    setUserMessage,
    isLoading,
    isConnected,
    copiedStates,
    tableData,
    sendMessage,
    handleCopy,
    turnInProgress,
    isWebSearchActive
  } = useChatSocket(socket);

  // Add restart chat handler
  const handleRestartChat = () => {
    setMessages([]);
    setUserMessage('');
    // Optionally, reset previousResponseId if exposed
    if (typeof window !== 'undefined' && window.previousResponseId) {
      window.previousResponseId.current = null;
    }
  };

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

  React.useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
    Prism.highlightAll();
  }, [messages]);

  React.useEffect(() => {
    messages.forEach(message => {
      const messageContainer = document.getElementById(`message-${message.id}`);
      if (messageContainer) {
        const tablePlaceholders = messageContainer.querySelectorAll('[data-table]');
        tablePlaceholders.forEach(placeholder => {
          try {
            const data = JSON.parse(placeholder.getAttribute('data-table'));
            let root = placeholder._reactRoot;
            if (!root) {
              root = createRoot(placeholder);
              placeholder._reactRoot = root;
            }
            root.render(<DataTable data={data} />);
          } catch (error) {
            console.error('Error rendering table:', error);
          }
        });
      }
    });
    return () => {
      messages.forEach(message => {
        const messageContainer = document.getElementById(`message-${message.id}`);
        if (messageContainer) {
          const tablePlaceholders = messageContainer.querySelectorAll('[data-table]');
          tablePlaceholders.forEach(placeholder => {
            if (placeholder._reactRoot) {
              placeholder._reactRoot.unmount();
              delete placeholder._reactRoot;
            }
          });
        }
      });
    };
  }, [messages, tableData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Find the last user message index
  const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user');
  const lastUserMessageIdx = lastUserIdx === -1 ? -1 : messages.length - 1 - lastUserIdx;
  // Are there any assistant/tool messages after the last user message?
  const hasStreamedThisTurn = messages.slice(lastUserMessageIdx + 1).some(
    m => m.role === 'assistant' || m.role === 'tool'
  );
  // Show chat loader only if isLoading and nothing streamed yet
  const showChatLoader = isLoading && !hasStreamedThisTurn;

  return (
    <DraggableModal
      title={
        <div className="flex items-center gap-2">
          <span>Chat</span>
          <Button size="sm" variant="outline" onClick={handleRestartChat} className="ml-2">Restart Chat</Button>
        </div>
      }
      isOpen={isOpen}
      onClose={onClose}
      defaultPosition={modalPosition || { x: 100, y: 100 }}
      defaultWidth={450}
      defaultHeight={600}
      minWidth={300}
      minHeight={300}
      resizable={true}
    >
      <div className="flex flex-col h-full w-full overflow-hidden">
        <ScrollArea
          ref={scrollRef}
          className="flex-1 px-3 py-2"
        >
          <div className="space-y-2 pr-2">
            {!isConnected && (
              <div className="flex justify-center">
                <div className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2">
                  Disconnected from server. Reconnecting...
                </div>
              </div>
            )}
            {/* Conversation Starters */}
            {messages.length === 0 && isConnected && !isLoading && (
              <div className="mb-4">
                <div className="text-xs text-muted-foreground mb-2">Try one of these to get started:</div>
                <div
                  className="grid gap-3 grid-cols-1 sm:grid-cols-2"
                  style={{ maxWidth: 400 }}
                >
                  <ChatStarters onSelect={setUserMessage} />
                </div>
              </div>
            )}
            {filteredMessages.map((message, idx) => (
              <ChatMessage
                key={message.id || `msg-${idx}`}
                message={message}
                onCopy={handleCopy}
                copiedStates={copiedStates}
              />
            ))}
            {/* Web-search badge */}
            {isWebSearchActive && (
              <div className="flex justify-start mb-2">
                <div className="bg-gray-200 text-gray-800 rounded-lg px-3 py-1.5 inline-flex items-center gap-1" role="status" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Searching the web... 🔎</span>
                </div>
              </div>
            )}
            {showChatLoader && (
              <div className="flex justify-start mb-2">
                <div className="bg-muted rounded-lg px-3 py-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-2">
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={isConnected ? "Type a message..." : "Connecting to server..."}
              disabled={!isConnected || isLoading || turnInProgress}
              className="flex-1 text-sm"
              textareaClassName="w-full"
              minRows={1}
              maxRows={6}
            />
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!userMessage.trim() || !isConnected || isLoading || turnInProgress}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </DraggableModal>
  );
}

ChatModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  socket: PropTypes.shape({
    connected: PropTypes.bool,
    emit: PropTypes.func,
    on: PropTypes.func,
    off: PropTypes.func
  }),
  modalPosition: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number
  })
};
