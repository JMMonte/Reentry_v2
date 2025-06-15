import React from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle } from 'lucide-react';
import { MessageBadge } from '../MessageBadge';

export function ErrorMessage({ message }) {
  return (
    <div
      id={`message-${message.id}`}
      className="mb-2 flex justify-start"
    >
      <div className="rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
        <div className="flex items-center mb-1">
          <MessageBadge type="error" />
        </div>
        
        <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold">Error:</span>
          {message.code && (
            <span className="font-mono bg-red-100 dark:bg-red-900 px-1 py-0.5 rounded text-xs">
              [{message.code}]
            </span>
          )}
          <span>{message.content || message.message}</span>
        </div>
      </div>
    </div>
  );
}

ErrorMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    content: PropTypes.string,
    message: PropTypes.string,
    code: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired
};