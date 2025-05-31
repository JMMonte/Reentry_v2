import React from 'react';
import PropTypes from 'prop-types';
import { Link2 } from 'lucide-react';
import { DataTable } from '../../table/DataTable';
import DOMPurify from 'dompurify';
import { getMessageClasses, chatTheme } from '../theme';
import { marked } from 'marked';
import {
  processLatex,
  renderLatexBlocks,
  processCodeBlocks,
  extractTables
} from '../markdown';

// Helper to render web search citations
const renderCitations = (annotations) => {
  if (!Array.isArray(annotations)) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {annotations.filter(a => a.type === 'url_citation').map((a, i) => (
        <a 
          key={i} 
          href={a.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs hover:underline"
        >
          <Link2 className="w-3 h-3" />
          {a.title || a.url}
        </a>
      ))}
    </div>
  );
};

export function AssistantMessage({ message, onCopy, isStreaming = false }) {
  const classes = getMessageClasses('assistant', isStreaming);
  let content = message.content || '';
  let tables = [];

  // Process content for markdown, LaTeX, and tables
  if (typeof content === 'object') content = JSON.stringify(content, null, 2);
  content = String(content);

  try {
    const { text, blocks } = processLatex(content);
    marked.setOptions({
      highlight: function (code, lang) {
        if (window.Prism && window.Prism.languages[lang]) {
          return window.Prism.highlight(code, window.Prism.languages[lang], lang);
        }
        return code;
      }
    });
    
    let processed = marked.parse(text, {
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });
    
    processed = renderLatexBlocks(processed, blocks);
    processed = processCodeBlocks(processed);
    const tableData = extractTables(processed);
    content = tableData.content;
    tables = tableData.tables;
    
    content = DOMPurify.sanitize(content, {
      USE_PROFILES: { html: true },
      ALLOWED_TAGS: [
        'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'br', 'span', 'div',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'svg', 'rect', 'path',
        'math', 'annotation', 'semantics', 'mrow', 'mn', 'mi', 'mo', 'msup',
        'mfrac', 'mspace', 'mtable', 'mtr', 'mtd', 'mstyle', 'mtext', 'munder',
        'mover', 'msub', 'msqrt'
      ],
      ALLOWED_ATTR: [
        'class', 'style', 'aria-hidden', 'data-latex', 'mathvariant', 'language-*',
        'data-copy-button', 'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke',
        'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'x', 'y', 'rx', 'ry', 'd',
        'data-table-id'
      ]
    });
  } catch {
    content = String(content);
  }

  // Split content for table insertion
  const parts = content.split(/<div data-table-id="([^"]+)"><\/div>/);
  const elements = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Text content
      if (parts[i]) {
        elements.push(
          <div
            key={`text-${i}`}
            className={chatTheme.typography.assistantContent}
            dangerouslySetInnerHTML={{ __html: parts[i] }}
            onClick={e => {
              const copyButton = e.target.closest('[data-copy-button]');
              if (copyButton) {
                const pre = copyButton.parentElement.querySelector('pre');
                const code = pre.querySelector('code');
                if (code && onCopy) {
                  onCopy(code.textContent, copyButton.getAttribute('data-copy-button'));
                }
              }
            }}
          />
        );
      }
    } else {
      // Table content
      const tableId = parts[i];
      const tableData = tables.find(t => t.id === tableId);
      if (tableData) {
        elements.push(
          <div key={tableId} className="my-4">
            <DataTable data={tableData.data} />
          </div>
        );
      }
    }
  }

  return (
    <div
      id={`message-${message.id}`}
      className={classes.container}
    >
      <div className={classes.bubble}>
        <div className={chatTheme.layout.contentSpacing}>
          {elements}
          {message.annotations && renderCitations(message.annotations)}
        </div>
      </div>
    </div>
  );
}

AssistantMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    content: PropTypes.string,
    annotations: PropTypes.array
  }).isRequired,
  onCopy: PropTypes.func,
  isStreaming: PropTypes.bool
};