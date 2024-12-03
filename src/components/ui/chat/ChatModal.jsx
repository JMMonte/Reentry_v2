import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Send, Loader2 } from 'lucide-react';
import { ScrollArea } from '../scroll-area';
import { cn } from '../../../lib/utils';
import { DraggableModal } from '../modal/DraggableModal';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Configure marked to handle LaTeX
marked.setOptions({
  headerIds: false,
  breaks: true
});

// Add LaTeX rendering support to marked
const renderer = new marked.Renderer();

renderer.text = function(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  try {
    // Match inline LaTeX: $...$
    text = text.replace(/\$([^\$]+)\$/g, (_, tex) => {
      try {
        return katex.renderToString(tex, { displayMode: false });
      } catch (e) {
        console.error('KaTeX error:', e);
        return tex;
      }
    });
    
    // Match display LaTeX: $$...$$
    text = text.replace(/\$\$([^\$]+)\$\$/g, (_, tex) => {
      try {
        return katex.renderToString(tex, { displayMode: true });
      } catch (e) {
        console.error('KaTeX error:', e);
        return tex;
      }
    });
    
    return text;
  } catch (error) {
    console.error('Error in renderer.text:', error);
    return String(text);
  }
};

marked.use({ renderer });

export function ChatModal({ isOpen, onClose, socket }) {
  const [messages, setMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [modalPosition, setModalPosition] = useState(() => {
    return { x: 20, y: 80 };
  });

  // Handle initial socket state
  useEffect(() => {
    if (socket) {
      setIsConnected(socket.connected);
    }
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMessage = (data) => {
      console.log('Message received:', data);
      setMessages(prev => {
        const messageIndex = prev.findIndex(m => m.id === data.messageId);
        if (messageIndex !== -1) {
          const updatedMessages = [...prev];
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: data.content,
            status: data.status
          };
          return updatedMessages;
        } else {
          return [...prev, {
            id: data.messageId,
            role: data.role,
            content: data.content,
            status: data.status
          }];
        }
      });

      // Set loading to false when message is completed
      if (data.status === 'completed') {
        setIsLoading(false);
      }
    };

    const handleToolCall = async (toolCall) => {
      console.log('Tool call received:', toolCall);
      const { toolCallId, name, arguments: args } = toolCall;

      try {
        let output;
        switch (name) {
          case 'createSatelliteFromLatLon':
            output = await window.api.createSatellite({
              ...args,
              type: 'latlon'
            });
            break;

          case 'createSatelliteFromOrbitalElements':
            output = await window.api.createSatellite({
              ...args,
              type: 'orbital'
            });
            break;

          case 'createSatelliteFromLatLonCircular':
            output = await window.api.createSatellite({
              ...args,
              type: 'circular'
            });
            break;

          case 'getMoonOrbit':
            output = await window.api.getMoonOrbit();
            break;

          default:
            throw new Error(`Unknown tool call: ${name}`);
        }

        if (socket?.connected) {
          socket.emit('tool_response', {
            toolCallId,
            output: JSON.stringify(output)
          });
        }
      } catch (error) {
        console.error('Error executing tool call:', error);
        if (socket?.connected) {
          socket.emit('tool_response', {
            toolCallId,
            output: JSON.stringify({ error: error.message })
          });
        }
      }
    };

    const handleError = (error) => {
      console.error('Socket error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'error',
        content: error.message,
        status: 'completed'
      }]);
    };

    const handleThreadCreated = (data) => {
      console.log('Thread created:', data);
      setThreadId(data.threadId);
    };

    const handleRunCompleted = (data) => {
      console.log('Run completed:', data);
      setIsLoading(false);
    };

    const handleConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
      setIsLoading(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('message', handleMessage);
    socket.on('tool_call', handleToolCall);
    socket.on('error', handleError);
    socket.on('threadCreated', handleThreadCreated);
    socket.on('runCompleted', handleRunCompleted);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('message', handleMessage);
      socket.off('tool_call', handleToolCall);
      socket.off('error', handleError);
      socket.off('threadCreated', handleThreadCreated);
      socket.off('runCompleted', handleRunCompleted);
    };
  }, [socket]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userMessage.trim() || !isConnected) return;

    setIsLoading(true);
    
    // Add user message immediately
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      status: 'completed'
    }]);

    try {
      // Send message with thread ID if it exists
      socket.emit('chat message', userMessage, threadId);
      
      setUserMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'error',
        content: 'Failed to send message. Please try again.',
        status: 'completed'
      }]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const renderMessage = (message, index) => {
    if (!message || typeof message !== 'object') {
      console.error('Invalid message:', message);
      return null;
    }

    const isUser = message.role === 'user';
    const content = message.content;
    const isStreaming = message.status === 'streaming';

    return (
      <div
        key={message.id}
        className={cn(
          'mb-2 flex', 
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-3 py-1.5 max-w-[80%]', 
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
            isStreaming && 'animate-pulse'
          )}
        >
          <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
            {content || ' '}
            {isStreaming && (
              <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-blink" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DraggableModal
      title="Chat"
      isOpen={isOpen}
      onClose={onClose}
      defaultPosition={modalPosition}
      defaultHeight={500}
      minHeight={300}
      maxHeight={800}
      resizable={true}
      className="w-[400px]"
    >
      <div className="flex flex-col h-full">
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 px-3 py-2" 
        >
          <div className="space-y-2"> 
            {!isConnected && (
              <div className="flex justify-center">
                <div className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2">
                  Disconnected from server. Reconnecting...
                </div>
              </div>
            )}
            {messages.map(renderMessage)}
            {isLoading && (
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
            <Input
              ref={inputRef}
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? "Type a message..." : "Connecting to server..."}
              disabled={!isConnected || isLoading}
              className="flex-1 text-sm" 
            />
            <Button 
              size="sm" 
              onClick={handleSubmit}
              disabled={!userMessage.trim() || !isConnected || isLoading}
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
