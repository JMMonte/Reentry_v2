/**
 * Chat Theme System - Centralized styling for chat components
 * Provides consistent colors, spacing, and responsive design tokens
 */

export const chatTheme = {
  // Message bubble styling
  messages: {
    user: {
      container: "mb-2 flex justify-end",
      bubble: "rounded-2xl rounded-br-md px-4 py-2 max-w-[min(420px,85%)] relative group bg-primary text-primary-foreground shadow-sm"
    },
    assistant: {
      container: "mb-2 flex justify-start w-full max-w-full",
      bubble: "w-full max-w-full bg-transparent p-0 shadow-none border-none overflow-hidden flex-shrink min-w-0"
    },
    tool: {
      container: "mb-2 flex justify-start", 
      bubble: "rounded-2xl rounded-bl-md px-4 py-2 max-w-[min(420px,85%)] relative group bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800 shadow-sm"
    },
    error: {
      container: "mb-2 flex justify-start",
      bubble: "rounded-2xl rounded-bl-md px-4 py-2 max-w-[min(420px,85%)] relative group bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800 shadow-sm"
    },
    codeInterpreter: {
      container: "mb-2 flex justify-start",
      bubble: "rounded-2xl rounded-bl-md px-4 py-3 max-w-[min(500px,90%)] relative group bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-lg"
    }
  },

  // Code styling
  code: {
    inline: "font-mono text-xs bg-secondary/60 dark:bg-secondary/80 px-1.5 py-0.5 rounded-sm border",
    block: {
      container: "my-3 rounded-lg border bg-card shadow-sm overflow-hidden",
      header: "flex items-center justify-between px-3 py-2 bg-muted/50 border-b text-xs font-medium",
      content: "p-0 overflow-x-auto",
      pre: "bg-zinc-900 text-zinc-100 p-4 text-sm leading-relaxed font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent",
      copyButton: "px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors"
    }
  },

  // Typography
  typography: {
    messageText: "text-sm leading-relaxed whitespace-pre-wrap break-words",
    assistantContent: [
      "text-sm leading-relaxed break-words",
      "prose prose-sm dark:prose-invert max-w-none",
      "prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-headings:first:mt-0",
      "prose-p:text-foreground prose-p:my-2",
      "prose-ul:text-foreground prose-ul:my-2 prose-ul:ml-4",
      "prose-ol:text-foreground prose-ol:my-2 prose-ol:ml-4", 
      "prose-li:text-foreground prose-li:my-1",
      "prose-strong:text-foreground prose-strong:font-semibold",
      "prose-em:text-foreground prose-em:italic",
      "prose-code:text-foreground prose-code:bg-secondary/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-xs prose-code:border",
      "prose-pre:text-foreground prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-3",
      "[&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-card [&_pre]:shadow-sm [&_pre]:overflow-hidden",
      "[&_pre_code]:!text-sm [&_pre_code]:!leading-relaxed [&_pre_code]:block [&_pre_code]:w-full [&_pre_code]:p-4 [&_pre_code]:bg-zinc-900 [&_pre_code]:text-zinc-100"
    ].join(" "),
    badge: "text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border",
    toolName: "text-xs font-medium text-amber-800 dark:text-amber-200",
    errorText: "text-sm text-red-700 dark:text-red-300"
  },

  // Interactive elements
  interactive: {
    copyButton: "opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-secondary/80 rounded text-muted-foreground hover:text-foreground",
    expandButton: "text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none py-1 px-2 rounded hover:bg-secondary/50 transition-colors"
  },

  // Layout and spacing
  layout: {
    messageSpacing: "space-y-3",
    contentSpacing: "space-y-2",
    sectionSpacing: "mt-3 first:mt-0"
  },

  // Animations
  animations: {
    streaming: "", // Removed animate-pulse to prevent scaling
    fadeIn: "", // Removed fade-in animation to prevent jumping
    slideIn: ""
  },

  // File display
  files: {
    container: "mt-3 space-y-2",
    item: "flex items-center gap-2 p-2 bg-secondary/30 dark:bg-secondary/20 rounded-lg border text-xs",
    link: "text-blue-600 dark:text-blue-400 hover:underline font-medium",
    image: "max-h-48 max-w-full rounded-lg border shadow-sm mt-2"
  }
};

// Utility function to get theme classes
export const getMessageClasses = (type, isStreaming = false) => {
  const base = chatTheme.messages[type] || chatTheme.messages.assistant;
  return {
    container: `${base.container} ${isStreaming ? chatTheme.animations.fadeIn : ''}`,
    bubble: `${base.bubble} ${isStreaming ? chatTheme.animations.streaming : ''}`
  };
};