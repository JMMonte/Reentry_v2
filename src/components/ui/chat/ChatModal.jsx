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
        if (!window.api) {
          throw new Error('API not initialized');
        }

        let output;
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        
        switch (name) {
          case 'createSatelliteFromLatLon':
            // Map velocity/azimuth to speed/heading if needed
            const mappedArgs = {
              ...parsedArgs,
              speed: parsedArgs.speed || parsedArgs.velocity,
              heading: parsedArgs.heading || parsedArgs.azimuth
            };
            
            // Validate required parameters
            if (typeof mappedArgs.latitude !== 'number' || 
                typeof mappedArgs.longitude !== 'number' || 
                typeof mappedArgs.altitude !== 'number' || 
                typeof mappedArgs.speed !== 'number' || 
                typeof mappedArgs.heading !== 'number') {
              throw new Error('Missing required parameters for createSatelliteFromLatLon');
            }
            output = await window.api.createSatellite({
              ...mappedArgs,
              mode: 'latlon'
            });
            break;
            
          case 'createSatelliteFromOrbitalElements':
            // Validate required parameters
            if (typeof parsedArgs.semiMajorAxis !== 'number' || 
                typeof parsedArgs.eccentricity !== 'number' || 
                typeof parsedArgs.inclination !== 'number' || 
                typeof parsedArgs.raan !== 'number' || 
                typeof parsedArgs.argumentOfPeriapsis !== 'number' || 
                typeof parsedArgs.trueAnomaly !== 'number') {
              throw new Error('Missing required parameters for createSatelliteFromOrbitalElements');
            }
            output = await window.api.createSatellite({
              ...parsedArgs,
              mode: 'orbital'
            });
            break;
            
          case 'createSatelliteFromLatLonCircular':
            // Validate required parameters - only need lat, lon, altitude, and azimuth
            if (typeof parsedArgs.latitude !== 'number' || 
                typeof parsedArgs.longitude !== 'number' || 
                typeof parsedArgs.altitude !== 'number' || 
                typeof parsedArgs.azimuth !== 'number') {
              throw new Error('Missing required parameters for createSatelliteFromLatLonCircular');
            }
            output = await window.api.createSatellite({
              ...parsedArgs,
              mode: 'circular'
            });
            break;

          case 'getMoonOrbit':
            output = await window.api.getMoonOrbit();
            break;

          default:
            throw new Error(`Unknown tool call: ${name}`);
        }

        const response = {
          toolCallId,
          output: JSON.stringify(output || {})
        };
        console.log('Sending tool response:', response);
        
        if (socket?.connected) {
          socket.emit('tool_response', response);
        }
      } catch (error) {
        console.error('Error executing tool call:', error);
        const errorResponse = {
          toolCallId,
          output: JSON.stringify({ error: error.message })
        };
        console.log('Sending error response:', errorResponse);
        
        if (socket?.connected) {
          socket.emit('tool_response', errorResponse);
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
      setThreadId(data.threadId);
    };

    const handleRunCompleted = (data) => {
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
