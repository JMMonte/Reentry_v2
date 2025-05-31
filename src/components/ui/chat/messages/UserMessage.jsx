import React from 'react';
import PropTypes from 'prop-types';
import { getMessageClasses, chatTheme } from '../theme';

export function UserMessage({ message }) {
  const classes = getMessageClasses('user');
  
  return (
    <div
      id={`message-${message.id}`}
      className={classes.container}
    >
      <div className={classes.bubble}>
        <div className={chatTheme.typography.messageText}>
          {message.content}
        </div>
      </div>
    </div>
  );
}

UserMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    content: PropTypes.string.isRequired
  }).isRequired
};