import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './components/theme-provider';
import App from './App';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  );
}
