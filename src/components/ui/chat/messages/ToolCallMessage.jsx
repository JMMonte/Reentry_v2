import React from 'react';
import PropTypes from 'prop-types';
import { Check, Loader2, Copy } from 'lucide-react';
import { Button } from '../../button';
import { MessageBadge } from '../MessageBadge';

// Tool Call Card UI for sent tool calls
const renderToolCallCard = ({ toolName, status, args, isDone, isStreaming }) => {
  // Format arguments as a readable list
  let argList = null;
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const entries = Object.entries(args);
    if (entries.length > 0) {
      argList = (
        <div className="mt-2 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="font-medium text-yellow-700 dark:text-yellow-300">{key}:</span>{' '}
              <span className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900 px-1 py-0.5 rounded">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-yellow-800 dark:text-yellow-200 text-xs">
          {toolName}
        </span>
        {isDone && <Check className="w-3 h-3 text-green-600" />}
        {isStreaming && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
      {argList}
    </div>
  );
};

export function ToolCallMessage({ message, isStreaming = false }) {
  const isDone = message.status === 'done';
  
  // Parse arguments
  let args = {};
  if (message.arguments) {
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
      <div className="rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
        <div className="flex items-center mb-1">
          <MessageBadge type="tool_call_sent" status={message.status} />
          {isStreaming && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
        </div>
        
        {renderToolCallCard({
          toolName: message.toolName || message.tool_name || 'Unknown Tool',
          status: message.status,
          args: args,
          isDone: isDone,
          isStreaming: isStreaming
        })}
        
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
    toolName: PropTypes.string,
    tool_name: PropTypes.string,
    status: PropTypes.string,
    arguments: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    raw: PropTypes.object
  }).isRequired,
  isStreaming: PropTypes.bool
};