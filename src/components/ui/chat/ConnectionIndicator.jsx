import React from 'react';
import { Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';

export const ConnectionIndicator = React.memo(function ConnectionIndicator({ socket, isConnected, isWebSearchActive }) {
  if (!socket) {
    return (
      <div className="flex justify-center">
        <div className="bg-orange-500 text-white rounded-lg px-4 py-2 text-sm">
          AI chat requires a backend server. See README.md for setup instructions.
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex justify-center">
        <div className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2">
          Disconnected from server. Reconnecting...
        </div>
      </div>
    );
  }

  if (isWebSearchActive) {
    return (
      <div className="flex justify-start mb-2">
        <div className="bg-gray-200 text-gray-800 rounded-lg px-3 py-1.5 inline-flex items-center gap-1" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Searching the web... 🔎</span>
        </div>
      </div>
    );
  }

  return null;
});

ConnectionIndicator.propTypes = {
  socket: PropTypes.object,
  isConnected: PropTypes.bool.isRequired,
  isWebSearchActive: PropTypes.bool.isRequired
};