import React, { useEffect, useCallback, useMemo } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { DataTable } from '../table/DataTable';
import { createRoot } from 'react-dom/client';
import PropTypes from 'prop-types';
import { useSocket } from './useSocket';
import { Header } from './Header';
import { MessageArea } from './MessageArea';
import { InputArea } from './InputArea';

export const ChatModal = React.memo(function ChatModal({ isOpen, onClose, socket, modalPosition }) {
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
  } = useSocket(socket);

  // Memoize the restart chat handler
  const handleRestartChat = useCallback(() => {
    setMessages([]);  // This now uses setMessagesWithCleanup from useSocket
    setUserMessage('');
    // Optionally, reset previousResponseId if exposed
    if (typeof window !== 'undefined' && window.previousResponseId) {
      window.previousResponseId.current = null;
    }
  }, [setMessages, setUserMessage]);

  // Memoize chat loader calculation
  const showChatLoader = useMemo(() => {
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    const lastUserMessageIdx = lastUserIdx === -1 ? -1 : messages.length - 1 - lastUserIdx;
    const hasStreamedThisTurn = messages.slice(lastUserMessageIdx + 1).some(
      m => m.role === 'assistant' || m.role === 'tool'
    );
    return isLoading && !hasStreamedThisTurn;
  }, [messages, isLoading]);

  // Memoize modal position
  const memoizedModalPosition = useMemo(() => {
    return modalPosition || { x: 100, y: 100 };
  }, [modalPosition]);

  // Handle table rendering (debounced for performance)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
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
    }, 100); // Debounce to prevent excessive DOM queries

    return () => {
      clearTimeout(timeoutId);
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

  // Memoize header component
  const headerComponent = useMemo(() => (
    <Header onRestartChat={handleRestartChat} />
  ), [handleRestartChat]);

  return (
    <DraggableModal
      title={headerComponent}
      isOpen={isOpen}
      onClose={onClose}
      defaultPosition={memoizedModalPosition}
      defaultWidth={450}
      defaultHeight={600}
      minWidth={300}
      minHeight={300}
      resizable={true}
    >
      <div className="flex flex-col h-full w-full overflow-hidden">
        <MessageArea 
          messages={messages}
          socket={socket}
          isConnected={isConnected}
          isLoading={isLoading}
          isWebSearchActive={isWebSearchActive}
          copiedStates={copiedStates}
          onCopy={handleCopy}
          onSelectStarter={setUserMessage}
          showChatLoader={showChatLoader}
        />
        
        <InputArea 
          userMessage={userMessage}
          setUserMessage={setUserMessage}
          onSendMessage={sendMessage}
          socket={socket}
          isConnected={isConnected}
          isLoading={isLoading}
          turnInProgress={turnInProgress}
        />
      </div>
    </DraggableModal>
  );
});

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