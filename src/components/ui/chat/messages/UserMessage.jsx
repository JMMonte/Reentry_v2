import React from 'react';
import PropTypes from 'prop-types';

export const UserMessage = React.memo(function UserMessage({ message }) {
  return (
    <div className="flex justify-end mb-4">
      <div className="bg-blue-500 text-white p-3 rounded-lg max-w-xs lg:max-w-md">
        <p className="text-sm">{message.content}</p>
      </div>
    </div>
  );
});

UserMessage.propTypes = {
  message: PropTypes.shape({
    content: PropTypes.string.isRequired,
  }).isRequired,
};