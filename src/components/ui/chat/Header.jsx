import React from 'react';
import { Button } from '../button';
import PropTypes from 'prop-types';

export const Header = React.memo(function Header({ onRestartChat }) {
  return (
    <div className="flex items-center gap-2">
      <span>Chat</span>
      <Button 
        size="sm" 
        variant="outline" 
        onClick={onRestartChat} 
        className="ml-2"
      >
        Restart Chat
      </Button>
    </div>
  );
});

Header.propTypes = {
  onRestartChat: PropTypes.func.isRequired
};