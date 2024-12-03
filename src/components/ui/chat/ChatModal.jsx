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
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [modalPosition, setModalPosition] = useState(() => {
    return { x: 20, y: 80 };
  });

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message) => {
      console.log('Received message:', message);
      
      if (!message || !message.role || !message.content) {
        console.error('Invalid message format:', message);
        return;
      }

      // Add message to the list if it's not already there
      setMessages(prev => {
        const messageExists = prev.some(m => 
          m.role === message.role && 
          m.content === message.content
        );
        return messageExists ? prev : [...prev, message];
      });
      
      if (message.role === 'assistant') {
        setIsLoading(false);
      }
    };

    const handleError = (error) => {
      console.error('Socket error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error}`,
        status: 'completed'
      }]);
    };

    socket.on('message', handleMessage);
    socket.on('error', handleError);

    return () => {
      socket.off('message', handleMessage);
      socket.off('error', handleError);
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

  const handleSend = () => {
    if (!inputValue.trim() || !socket || isLoading) return;

    const messageContent = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    
    socket.emit('chat message', messageContent);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessage = (message, index) => {
    if (!message || typeof message !== 'object') {
      console.error('Invalid message:', message);
      return null;
    }

    const isUser = message.role === 'user';
    
    // Get the message content directly, it's already a string
    const content = message.content;

    return (
      <div
        key={index}
        className={cn(
          'mb-2 flex', 
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-3 py-1.5 max-w-[80%]', 
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
            {content}
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 text-sm" 
            />
            <Button 
              size="sm" 
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
            >
              <Send className="h-3 w-3" /> 
            </Button>
          </div>
        </div>
      </div>
    </DraggableModal>
  );
}
