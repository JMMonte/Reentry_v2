import React from 'react';
import { Check } from 'lucide-react';
import PropTypes from 'prop-types';

export function MessageBadge({ type, status }) {
  const map = {
    conversation_start: { label: 'User Message', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    answer_start: { label: 'Assistant Typing', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    message: { label: 'Assistant', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    answer_end: { label: 'Assistant Done', color: 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100' },
    conversation_end: { label: 'Turn End', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' },
    tool_call_sent: { label: 'Tool Call', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    tool_call_response: { label: 'Tool Response', color: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-800 dark:text-yellow-100' },
    error: { label: 'Error', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    tool: { label: 'Tool', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    user: { label: 'User', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    assistant: { label: 'Assistant', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
  };
  
  const info = map[type] || { label: type, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' };
  
  return (
    <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
      {info.label}
      {type === 'tool_call_sent' && status === 'done' && <Check className="w-3 h-3 text-muted-foreground" />}
    </span>
  );
}

MessageBadge.propTypes = {
  type: PropTypes.string.isRequired,
  status: PropTypes.string
};