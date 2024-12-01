import React from 'react';

export function Clock({ simulatedTime }) {
  if (!simulatedTime) return null;

  const date = new Date(simulatedTime);
  
  // Format date
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  
  // Format time
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

  return (
    <div className="font-mono text-sm flex items-center space-x-2">
      <div className="text-muted-foreground">
        {`${year}-${month}-${day}`}
      </div>
      <div>
        {`${hours}:${minutes}:${seconds}.${milliseconds}`}
      </div>
    </div>
  );
}
