import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Send, Loader2, Copy, Check, X } from 'lucide-react';
import { ScrollArea } from '../scroll-area';
import { cn } from '../../../lib/utils';
import { DraggableModal } from '../modal/DraggableModal';
import { marked } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import 'katex/dist/katex.min.css';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import { DataTable } from '../table/DataTable';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false,
  highlight: function(code, lang) {
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

// Process LaTeX in text
const processLatex = (text) => {
  const latexBlocks = [];
  let index = 0;

  // Function to create a placeholder and store LaTeX
  const createPlaceholder = (latex, isDisplay) => {
    const placeholder = `%%%LATEX${index}%%%`;
    latexBlocks.push({
      placeholder,
      latex,
      isDisplay
    });
    index++;
    return placeholder;
  };

  try {
    // Replace display LaTeX first (using \[ \] or $$ $$)
    let processedText = text.replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g, (match, tex1, tex2) => {
      const tex = tex1 || tex2;
      return createPlaceholder(tex, true);
    });

    // Replace inline LaTeX (\( \) or $ $)
    processedText = processedText.replace(/\\\(([\s\S]+?)\\\)|\$([^\$\n]+?)\$/g, (match, tex1, tex2) => {
      const tex = tex1 || tex2;
      return createPlaceholder(tex, false);
    });

    return {
      text: processedText,
      blocks: latexBlocks
    };
  } catch (error) {
    console.error('Error in initial LaTeX processing:', error);
    return {
      text,
      blocks: []
    };
  }
};

// Render LaTeX blocks back into HTML
const renderLatexBlocks = (text, blocks) => {
  let result = text;
  for (const { placeholder, latex, isDisplay } of blocks) {
    try {
      const rendered = katex.renderToString(latex.trim(), {
        displayMode: isDisplay,
        throwOnError: false,
        strict: false,
        trust: true
      });
      // Escape special regex characters in placeholder
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace the exact placeholder with the rendered LaTeX
      result = result.replace(new RegExp(escapedPlaceholder, 'g'), rendered);
    } catch (error) {
      console.error('Error rendering LaTeX block:', { latex, error });
      // If rendering fails, restore original LaTeX
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(
        new RegExp(escapedPlaceholder, 'g'), 
        isDisplay ? `$$${latex}$$` : `$${latex}$`
      );
    }
  }
  return result;
};

export function ChatModal({ isOpen, onClose, socket, modalPosition }) {
  const [messages, setMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [copiedStates, setCopiedStates] = useState({});
  const [tableData, setTableData] = useState(new Map());

  // Conversation starters
  const conversationStarters = [
    "Create a Walker constellation with 24 satellites.",
    "Show me a sun-synchronous orbit for Earth observation.",
    "Design a spacecraft in a Molniya orbit.",
    "Create a custom constellation with 6 planes and 4 satellites per plane.",
    "Place a satellite in a geostationary orbit.",
    "Show a spacecraft in a lunar transfer orbit.",
    // Fun and creative starters
    "Create a Galileo constellation analogue.",
    "Create a nice geometric satellite constellation art around the Earth.",
    "Create satellites over each city in Europe moving eastward.",
    "Simulate a mega-constellation for global internet coverage.",
    "Arrange satellites in a flower-shaped pattern around the planet.",
    "Put a satellite in a retrograde orbit.",
    "Create a constellation for continuous coverage of the North Pole.",
    "Design a constellation for tracking ships across all oceans.",
    "Show a satellite in a highly elliptical orbit passing over Antarctica."
  ];

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
    // Highlight all code blocks after render
    Prism.highlightAll();
  }, [messages]);

  useEffect(() => {
    messages.forEach(message => {
      const messageContainer = document.getElementById(`message-${message.id}`);
      if (messageContainer) {
        const tablePlaceholders = messageContainer.querySelectorAll('[data-table]');
        tablePlaceholders.forEach(placeholder => {
          try {
            const data = JSON.parse(placeholder.getAttribute('data-table'));
            
            // Check if a root already exists
            let root = placeholder._reactRoot;
            if (!root) {
              // Create a new root if one doesn't exist
              root = createRoot(placeholder);
              placeholder._reactRoot = root;
            }
            
            // Render the table component
            root.render(<DataTable data={data} />);
          } catch (error) {
            console.error('Error rendering table:', error);
          }
        });
      }
    });

    // Cleanup function to unmount roots when component unmounts
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

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const processCodeBlocks = (content) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    // Process code blocks
    const preElements = doc.querySelectorAll('pre');
    preElements.forEach((pre, index) => {
      const code = pre.querySelector('code');
      if (code) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'relative group';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        
        const button = doc.createElement('button');
        button.className = 'absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs shadow-sm hover:bg-primary/90';
        button.setAttribute('data-copy-button', `code-${index}`);
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>';
        wrapper.appendChild(button);
      }
    });
    
    return doc.body.innerHTML;
  };

  const extractTables = (content) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const tables = [];
    const tableElements = doc.querySelectorAll('table');
    
    tableElements.forEach((table, index) => {
      // Convert table to data array
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );
      
      // Create data object array
      const data = rows.map(row => 
        Object.fromEntries(headers.map((header, i) => [header, row[i]]))
      );

      // Add table data to array and replace table with placeholder
      tables.push({ id: `table-${index}`, data });
      const placeholder = doc.createElement('div');
      placeholder.setAttribute('data-table-id', `table-${index}`);
      table.parentNode.replaceChild(placeholder, table);
    });
    
    return { content: doc.body.innerHTML, tables };
  };

  const renderMessage = (message) => {
    if (!message?.content) return null;

    const isUser = message.role === 'user';
    const isStreaming = message.status === 'streaming';
    
    let content = message.content;
    let tables = [];

    if (typeof content === 'object') {
      content = content.toString();
    }
    content = String(content);

    if (!isUser) {
      try {
        // First protect LaTeX blocks
        const { text, blocks } = processLatex(content);

        // Configure marked with syntax highlighting
        marked.setOptions({
          highlight: function(code, lang) {
            if (Prism.languages[lang]) {
              return Prism.highlight(code, Prism.languages[lang], lang);
            }
            return code;
          }
        });

        // Parse markdown with syntax highlighting
        let processed = marked.parse(text, {
          breaks: true,
          gfm: true,
          headerIds: false,
          mangle: false
        });

        // Restore and render LaTeX blocks
        processed = renderLatexBlocks(processed, blocks);

        // Process code blocks and extract tables
        processed = processCodeBlocks(processed);
        const tableData = extractTables(processed);
        content = tableData.content;
        tables = tableData.tables;

        // Sanitize the final HTML
        content = DOMPurify.sanitize(content, {
          USE_PROFILES: { html: true },
          ALLOWED_TAGS: [
            'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'br', 'span', 'div',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'svg', 'rect', 'path',
            // Math-related tags
            'math', 'annotation', 'semantics', 'mrow', 'mn', 'mi', 'mo', 'msup',
            'mfrac', 'mspace', 'mtable', 'mtr', 'mtd', 'mstyle', 'mtext', 'munder',
            'mover', 'msub', 'msqrt'
          ],
          ALLOWED_ATTR: [
            'class', 'style', 'aria-hidden', 'data-latex', 'mathvariant', 'language-*',
            'data-copy-button', 'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke',
            'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'x', 'y', 'rx', 'ry', 'd',
            'data-table-id'
          ]
        });
      } catch (error) {
        console.error('Error parsing message:', error);
        content = String(content);
      }
    }

    // Split content by table placeholders and create elements array
    const parts = content.split(/<div data-table-id="([^"]+)"><\/div>/);
    const elements = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Text content
        if (parts[i]) {
          elements.push(
            <div 
              key={`text-${i}`}
              className={cn(
                "text-xs leading-relaxed break-words",
                "prose prose-sm dark:prose-invert max-w-none",
                "prose-headings:text-foreground prose-headings:font-semibold prose-headings:my-2",
                "prose-p:text-foreground prose-p:my-1",
                "prose-ul:text-foreground prose-ul:my-1",
                "prose-ol:text-foreground prose-ol:my-1",
                "prose-li:text-foreground prose-li:my-0.5",
                "prose-strong:text-foreground prose-strong:font-semibold",
                "prose-em:text-foreground prose-em:italic",
                "prose-code:text-foreground prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-xs",
                "[&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:w-[294px]",
                "[&_pre]:scrollbar-thin [&_pre]:scrollbar-thumb-secondary [&_pre]:scrollbar-track-transparent",
                "prose-pre:text-foreground prose-pre:bg-secondary prose-pre:p-2 prose-pre:my-2 prose-pre:rounded-md",
                "[&_pre_code]:!text-xs [&_pre_code]:!leading-relaxed [&_pre_code]:block [&_pre_code]:w-full",
                isStreaming && "animate-pulse"
              )}
              dangerouslySetInnerHTML={{ __html: parts[i] }}
              onClick={(e) => {
                const copyButton = e.target.closest('[data-copy-button]');
                if (copyButton) {
                  const pre = copyButton.parentElement.querySelector('pre');
                  const code = pre.querySelector('code');
                  if (code) {
                    handleCopy(code.textContent, copyButton.getAttribute('data-copy-button'));
                  }
                }
              }}
            />
          );
        }
      } else {
        // Table placeholder
        const tableId = parts[i];
        const tableData = tables.find(t => t.id === tableId);
        if (tableData) {
          elements.push(
            <div key={tableId} className="my-4">
              <DataTable data={tableData.data} />
            </div>
          );
        }
      }
    }

    return (
      <div
        id={`message-${message.id}`}
        key={message.id}
        className={cn(
          'mb-2 flex',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-3 py-1.5 max-w-[320px] relative group',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          {!isUser && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 flex items-center gap-1 bg-secondary/80 hover:bg-secondary"
              onClick={() => handleCopy(message.content, message.id)}
            >
              {copiedStates[message.id] ? (
                <>
                  <Check className="h-3 w-3" />
                  <span className="text-xs">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span className="text-xs">Copy</span>
                </>
              )}
            </Button>
          )}
          {isUser ? (
            <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
          ) : (
            <>{elements}</>
          )}
          {isStreaming && (
            <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-blink" />
          )}
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
      defaultWidth={450}
      defaultHeight={600}
      minHeight={300}
      resizable={true}
      className="w-[400px]"
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
                  {conversationStarters.map((starter, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left px-4 py-3 rounded-xl bg-secondary shadow-sm border border-border hover:bg-primary/10 transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 break-words min-h-[56px]"
                      onClick={() => setUserMessage(starter)}
                      type="button"
                    >
                      {starter}
                    </button>
                  ))}
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
