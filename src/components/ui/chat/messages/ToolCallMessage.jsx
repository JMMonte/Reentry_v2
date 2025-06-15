import React from 'react';
import PropTypes from 'prop-types';
import { Check, Loader2, Copy, Satellite, Clock, Search, Radio, Map, Settings, Globe, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../../button';
import { MessageBadge } from '../MessageBadge';

// Get icon for tool based on its name/type
const getToolIcon = (toolName) => {
  const name = toolName?.toLowerCase() || '';
  
  // Satellite creation/management
  if (name.includes('satellite') || name.includes('maneuver')) {
    return Satellite;
  }
  
  // Time control
  if (name.includes('time') || name.includes('warp')) {
    return Clock;
  }
  
  // Query/Get operations
  if (name.startsWith('get') || name.includes('calculate')) {
    return Search;
  }
  
  // Communications
  if (name.includes('comm') || name.includes('communication')) {
    return Radio;
  }
  
  // Ground tracking, POI, coverage
  if (name.includes('ground') || name.includes('poi') || name.includes('coverage') || name.includes('track')) {
    return Map;
  }
  
  // Default
  return Settings;
};

// Format tool result content in a more user-friendly way
const formatToolResult = (toolName, content) => {
  // Parse content if it's a string
  let data = content;
  if (typeof content === 'string') {
    try {
      data = JSON.parse(content);
    } catch {
      // If not JSON, return as-is
      return <div className="text-xs text-muted-foreground">{content}</div>;
    }
  }

  const name = toolName?.toLowerCase() || '';
  
  // Satellite creation results
  if (name.includes('createsatellite')) {
    if (data.success && data.satellite) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">Satellite Created Successfully</span>
          </div>
          <div className="bg-secondary/30 rounded-md p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Name</span>
              <span className="text-xs font-mono">{data.satellite.name || 'Unnamed'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">ID</span>
              <span className="text-xs font-mono">{data.satellite.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Orbiting</span>
              <div className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <span className="text-xs capitalize">{data.centralBody || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      );
    } else if (!data.success) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium">Creation Failed</span>
          </div>
          <div className="bg-destructive/10 rounded-md p-2">
            <span className="text-xs text-destructive">{data.error || 'Unknown error'}</span>
          </div>
        </div>
      );
    }
  }

  // Time-related results
  if (name.includes('time') || name.includes('warp')) {
    if (data.success) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Time Updated</span>
          </div>
          {data.time && (
            <div className="bg-secondary/30 rounded-md p-2">
              <span className="text-xs font-mono">{new Date(data.time).toLocaleString()}</span>
            </div>
          )}
          {data.factor !== undefined && (
            <div className="flex items-center justify-between bg-secondary/30 rounded-md p-2">
              <span className="text-xs text-muted-foreground">Time Warp</span>
              <span className="text-xs font-mono">{data.factor}x</span>
            </div>
          )}
        </div>
      );
    }
  }

  // Query results (getSatellites, getCelestialBodies, etc.)
  if (name.startsWith('get')) {
    if (data.success && Array.isArray(data.satellites)) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Found {data.satellites.length} satellite{data.satellites.length !== 1 ? 's' : ''}</span>
            <Satellite className="w-4 h-4 text-muted-foreground" />
          </div>
          {data.satellites.length > 0 && (
            <div className="bg-secondary/30 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
              {data.satellites.slice(0, 10).map((sat, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span className="text-xs truncate max-w-[150px]">{sat.name || sat.id}</span>
                  <span className="text-xs text-muted-foreground">{sat.centralBody || 'Unknown'}</span>
                </div>
              ))}
              {data.satellites.length > 10 && (
                <div className="text-xs text-muted-foreground text-center pt-1">
                  ... and {data.satellites.length - 10} more
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    if (data.success && Array.isArray(data.bodies)) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Available Celestial Bodies</span>
            <Globe className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="bg-secondary/30 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
            {data.bodies.map((body, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-xs">{body.name}</span>
                <span className="text-xs text-muted-foreground font-mono">ID: {body.naifId}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  // POI/Coverage results
  if (name.includes('poi') || name.includes('coverage')) {
    if (data.success && data.visiblePOIs) {
      const totalVisible = Object.values(data.visiblePOIs).flat().length;
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">POI Visibility Analysis</span>
            <Map className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="bg-secondary/30 rounded-md p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Visible POIs</span>
              <span className="text-xs font-mono">{totalVisible}</span>
            </div>
          </div>
        </div>
      );
    }
  }

  // Delete operations
  if (name.includes('delete')) {
    if (data.success) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm">{data.message || 'Deleted successfully'}</span>
        </div>
      );
    }
  }

  // Default success/error display
  if (data.success !== undefined) {
    if (data.success) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">Success</span>
          </div>
          {data.message && (
            <div className="bg-secondary/30 rounded-md p-2">
              <span className="text-xs">{data.message}</span>
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium">Error</span>
          </div>
          <div className="bg-destructive/10 rounded-md p-2">
            <span className="text-xs text-destructive">{data.error || data.message || 'Operation failed'}</span>
          </div>
        </div>
      );
    }
  }

  // Fallback to formatted JSON for unhandled cases
  return (
    <pre className="bg-secondary/50 text-secondary-foreground rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
};

// Tool Call Card UI for sent tool calls
const renderToolCallCard = ({ toolName, args, isDone, isStreaming }) => {
  // Format arguments as a readable list
  let argList = null;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const entries = Object.entries(args);
    if (entries.length > 0) {
      argList = (
        <div className="mt-2 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="font-medium text-muted-foreground">{key}:</span>{' '}
              <span className="font-mono text-xs bg-secondary/50 px-1 py-0.5 rounded">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  const ToolIcon = getToolIcon(toolName);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ToolIcon className="w-3 h-3 text-muted-foreground" />
        <span className="font-medium text-foreground/80 text-xs">
          {toolName}
        </span>
        {isDone && <Check className="w-3 h-3 text-muted-foreground" />}
        {isStreaming && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
      {argList}
    </div>
  );
};

export function ToolCallMessage({ message, isStreaming = false }) {
  const isDone = message.status === 'done';
  const isResult = message.type === 'tool_call_response';
  
  // Parse arguments or result content
  let args = {};
  let resultContent = null;
  
  if (isResult) {
    // For tool responses, show the result content
    resultContent = message.content || message.output;
    // Extract tool name from toolResponses if available
    const toolResponse = message.toolResponses?.[0];
    message.toolName = message.toolName || toolResponse?.name || 'Tool Result';
  } else if (message.arguments) {
    // For tool calls, parse arguments
    try {
      args = typeof message.arguments === 'string' 
        ? JSON.parse(message.arguments) 
        : message.arguments;
    } catch {
      // If parsing fails, keep as is
      args = { arguments: message.arguments };
    }
  }

  // Extract code if it's a code interpreter call
  const code = args.code || (message.raw && message.raw.code);

  return (
    <div
      id={`message-${message.id}`}
      className="mb-2 flex justify-start"
    >
      <div className={`rounded-lg px-3 py-1.5 max-w-[420px] relative group ${
        isResult 
          ? 'bg-muted/50 border border-border'
          : 'bg-amber-50/50 border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-800/50'
      }`}>
        <div className="flex items-center mb-1">
          <MessageBadge type={isResult ? "tool_call_response" : "tool_call_sent"} status={message.status} />
          {isStreaming && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
        </div>
        
        {isResult ? (
          // Show tool result
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {(() => {
                const ToolIcon = getToolIcon(message.toolName || message.tool_name);
                return <ToolIcon className="w-3 h-3 text-muted-foreground" />;
              })()}
              <span className="font-medium text-foreground/80 text-xs">
                {message.toolName || message.tool_name || 'Tool'} Result
              </span>
              <Check className="w-3 h-3 text-muted-foreground" />
            </div>
            {resultContent && formatToolResult(message.toolName || message.tool_name, resultContent)}
          </div>
        ) : (
          // Show tool call
          renderToolCallCard({
            toolName: message.toolName || message.tool_name || 'Unknown Tool',
            args: args,
            isDone: isDone,
            isStreaming: isStreaming
          })
        )}
        
        {/* Show code for code interpreter calls */}
        {code && (
          <details className="mt-2 bg-zinc-800 rounded border border-zinc-700">
            <summary className="cursor-pointer px-2 py-1 font-mono text-xs text-blue-200 select-none">
              Show code
            </summary>
            <pre className="bg-zinc-900 text-blue-100 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap border-0">
              <code
                className="language-python"
                dangerouslySetInnerHTML={{
                  __html: window.Prism && window.Prism.languages.python
                    ? window.Prism.highlight(code, window.Prism.languages.python, 'python')
                    : code
                }}
              />
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 mb-2 mt-1 px-2 py-1 text-xs bg-secondary/80 hover:bg-secondary"
              onClick={() => navigator.clipboard.writeText(code)}
            >
              <Copy className="h-3 w-3 inline mr-1" /> Copy code
            </Button>
          </details>
        )}
      </div>
    </div>
  );
}

ToolCallMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    type: PropTypes.string,
    content: PropTypes.string,
    output: PropTypes.any,
    toolResponses: PropTypes.any,
    toolName: PropTypes.string,
    tool_name: PropTypes.string,
    status: PropTypes.any,
    args: PropTypes.any,
    arguments: PropTypes.any,
    raw: PropTypes.any,
  }).isRequired,
  isStreaming: PropTypes.bool
};