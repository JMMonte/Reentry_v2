import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Send, Loader2 } from 'lucide-react';
import { ScrollArea } from '../scroll-area';
import { cn } from '../../../lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../sheet';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  createSatelliteFromLatLon,
  createSatelliteFromOrbitalElements,
  createSatelliteFromLatLonCircular
} from '../../../createSatellite.js';

// Configure marked to handle LaTeX
marked.setOptions({
  headerIds: false,
  breaks: true
});

// Add LaTeX rendering support to marked
const renderer = {
  text(text) {
    let result = text;
    // Match inline LaTeX: $...$
    result = result.replace(/\$([^\$]+)\$/g, (_, tex) => {
      try {
        return katex.renderToString(tex, { displayMode: false });
      } catch (e) {
        console.error('KaTeX error:', e);
        return tex;
      }
    });
    // Match display LaTeX: $$...$$
    result = result.replace(/\$\$([^\$]+)\$\$/g, (_, tex) => {
      try {
        return katex.renderToString(tex, { displayMode: true });
      } catch (e) {
        console.error('KaTeX error:', e);
        return tex;
      }
    });
    return result;
  }
};

marked.use({ renderer });

export function ChatSidebar({ open, onOpenChange, socket }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const handleResponse = (response) => {
      console.log('Received response:', response);
      setMessages(prev => [...prev, { text: response, type: 'received' }]);
      setIsLoading(false);
    };

    const handleError = (error) => {
      console.error('Received error:', error);
      setMessages(prev => [...prev, { text: `Error: ${error}`, type: 'error' }]);
      setIsLoading(false);
    };

    const handleFunctionCall = async (data) => {
      console.log('Received function call:', data);
      const { name, arguments: args } = data;

      try {
        let result;
        const app = window.app3d;
        if (!app) {
          throw new Error('App3D instance not found');
        }

        // Extract required dependencies from app instance
        const deps = {
          scene: app.scene,
          world: app.physicsWorld,
          earth: app.earth,
          moon: app.moon,
          satellites: app.satellites,
          vectors: app.vectors,
          gui: app.gui,
          guiManager: app.guiManager
        };

        switch (name) {
          case 'createSatelliteFromLatLon':
            result = await createSatelliteFromLatLon(
              deps.scene,
              deps.world,
              deps.earth,
              deps.moon,
              deps.satellites,
              deps.vectors,
              deps.gui,
              deps.guiManager,
              args.latitude,
              args.longitude,
              args.altitude,
              args.velocity,
              args.azimuth,
              0 // Default angleOfAttack
            );
            break;

          case 'createSatelliteFromOrbitalElements':
            result = await createSatelliteFromOrbitalElements(
              deps.scene,
              deps.world,
              deps.earth,
              deps.moon,
              deps.satellites,
              deps.vectors,
              deps.gui,
              deps.guiManager,
              args.semiMajorAxis,
              args.eccentricity,
              args.inclination,
              args.raan,
              args.argumentOfPeriapsis,
              args.trueAnomaly
            );
            break;

          case 'createSatelliteFromLatLonCircular':
            result = await createSatelliteFromLatLonCircular(
              deps.scene,
              deps.world,
              deps.earth,
              deps.moon,
              deps.satellites,
              deps.vectors,
              deps.gui,
              deps.guiManager,
              args.latitude,
              args.longitude,
              args.altitude,
              args.azimuth
            );
            break;

          case 'getMoonOrbit':
            if (!app.moon) {
              throw new Error('Moon object not found');
            }
            result = {
              position: app.moon.position.toArray(),
              velocity: app.moon.velocity.toArray()
            };
            break;

          default:
            throw new Error(`Unknown function: ${name}`);
        }

        // Send the result back to the server
        socket.emit('function_result', { 
          name, 
          result: {
            id: result.id,
            position: result.position?.toArray(),
            velocity: result.velocity?.toArray()
          }
        });

        // Add a message about the function execution
        setMessages(prev => [...prev, {
          text: `Created satellite with ID: ${result.id}`,
          type: 'system'
        }]);
      } catch (error) {
        console.error(`Error executing ${name}:`, error);
        socket.emit('error', `Failed to execute ${name}: ${error.message}`);
        setMessages(prev => [...prev, {
          text: `Error executing ${name}: ${error.message}`,
          type: 'error'
        }]);
      }
    };

    socket.on('response', handleResponse);
    socket.on('error', handleError);
    socket.on('function_call', handleFunctionCall);

    return () => {
      socket.off('response', handleResponse);
      socket.off('error', handleError);
      socket.off('function_call', handleFunctionCall);
    };
  }, [socket]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!socket || !inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setIsLoading(true);
    setMessages(prev => [...prev, { text: message, type: 'sent' }]);
    setInputValue('');

    // Emit message to server
    socket.emit('chat message', message);
  };

  const renderMessage = (message) => {
    const html = marked(message.text);
    return (
      <div 
        dangerouslySetInnerHTML={{ __html: html }}
        className={cn(
          "prose prose-invert max-w-none",
          "prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border",
          "prose-code:text-primary",
          message.type === 'error' && "text-red-500"
        )}
      />
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="left" 
        className="w-[400px] p-0 mt-[72px] h-[calc(100vh-72px)] bg-background/80 backdrop-blur-sm border-r data-[state=open]:bg-background/80"
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="shrink-0 p-4 border-b bg-background/90">
            <SheetTitle>Assistant</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex w-max max-w-[75%] rounded-lg px-3 py-2 text-sm',
                    message.type === 'sent'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : message.type === 'error'
                      ? 'bg-red-500/10'
                      : 'bg-muted/80 backdrop-blur-sm'
                  )}
                >
                  {renderMessage(message)}
                </div>
              ))}
              <div ref={messagesEndRef} />
              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="shrink-0 p-4 border-t bg-background/90">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                disabled={isLoading}
                className="bg-background"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
