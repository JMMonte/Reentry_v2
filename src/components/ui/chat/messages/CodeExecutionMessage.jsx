import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Terminal, Copy } from 'lucide-react';
import { Button } from '../../button';
import { MessageBadge } from '../MessageBadge';
import { getMessageClasses } from '../theme';

// Memoized code display component
const CodeDisplay = React.memo(function CodeDisplay({ code }) {
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
  }, [code]);

  const highlightedCode = useMemo(() => {
    if (window.Prism && window.Prism.languages.python) {
      return window.Prism.highlight(code, window.Prism.languages.python, 'python');
    }
    return code;
  }, [code]);

  return (
    <details className="mb-2 bg-zinc-800 rounded border border-zinc-700">
      <summary className="cursor-pointer px-2 py-1 font-mono text-xs text-blue-200 select-none">
        Show executed code
      </summary>
      <pre className="bg-zinc-900 text-blue-100 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap border-0">
        <code
          className="language-python"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="ml-2 mb-2 mt-1 px-2 py-1 text-xs bg-secondary/80 hover:bg-secondary"
        onClick={handleCopyCode}
      >
        <Copy className="h-3 w-3 inline mr-1" /> Copy code
      </Button>
    </details>
  );
});

CodeDisplay.propTypes = {
  code: PropTypes.string.isRequired
};

// Memoized file display component
const FileDisplay = React.memo(function FileDisplay({ file, index }) {
  const isImage = useMemo(() => {
    return file.name && file.name.match(/\.(png|jpg|jpeg|gif|svg)$/i);
  }, [file.name]);

  return (
    <li key={index} className="text-xs">
      {file.url ? (
        <a 
          href={file.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {file.name || `File ${index + 1}`}
        </a>
      ) : (
        <span className="text-zinc-300">{file.name || `File ${index + 1}`}</span>
      )}
      
      {/* Display images inline */}
      {isImage && file.url && (
        <div className="mt-1">
          <img 
            src={file.url} 
            alt={file.name} 
            className="max-h-48 rounded border border-zinc-600"
          />
        </div>
      )}
    </li>
  );
});

FileDisplay.propTypes = {
  file: PropTypes.shape({
    name: PropTypes.string,
    url: PropTypes.string
  }).isRequired,
  index: PropTypes.number.isRequired
};

export const CodeExecutionMessage = React.memo(function CodeExecutionMessage({ message }) {
  const classes = getMessageClasses('codeInterpreter');
  
  // Memoize extracted data
  const { code, output, files } = useMemo(() => ({
    code: message.raw?.code || '',
    output: message.output || message.content || '',
    files: Array.isArray(message.files) ? message.files : []
  }), [message.raw?.code, message.output, message.content, message.files]);

  return (
    <div
      id={`message-${message.id}`}
      className={classes.container}
    >
      <div className={classes.bubble}>
        <div className="flex items-center mb-2">
          <MessageBadge type="tool_call_response" />
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="text-xs font-medium text-green-300">Code Execution Result</span>
        </div>
        
        {/* Show code if available */}
        {code && <CodeDisplay code={code} />}
        
        {/* Show output */}
        {output && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-green-300">Output:</div>
            <pre className="bg-zinc-900 text-green-200 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap border border-zinc-800">
              {output}
            </pre>
          </div>
        )}
        
        {/* Show generated files */}
        {files.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-medium text-green-300 mb-1">Generated Files:</div>
            <ul className="space-y-1">
              {files.map((file, i) => (
                <FileDisplay key={i} file={file} index={i} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
});

CodeExecutionMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    content: PropTypes.string,
    output: PropTypes.string,
    files: PropTypes.array,
    raw: PropTypes.shape({
      code: PropTypes.string
    })
  }).isRequired
};