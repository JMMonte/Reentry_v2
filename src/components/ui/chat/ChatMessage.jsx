import React from 'react';
import { Button } from '../button';
import { Check, Copy, AlertTriangle, Terminal, Link2, Loader2 } from 'lucide-react';
import { DataTable } from '../table/DataTable';
import PropTypes from 'prop-types';
import DOMPurify from 'dompurify';
import { cn } from '../../../lib/utils';
import Prism from 'prismjs';
import { marked } from 'marked';
import {
    processLatex,
    renderLatexBlocks,
    processCodeBlocks,
    extractTables
} from './messageUtils';

// Helper to render event type badges
const EventBadge = ({ type, status }) => {
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
    // Add a checkmark for tool_call_sent if status is done
    return (
        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold mr-2 flex items-center gap-1', info.color)}>
            {info.label}
            {type === 'tool_call_sent' && status === 'done' && <Check className="w-3 h-3 text-green-500 dark:text-green-300 ml-1" />}
        </span>
    );
};
EventBadge.propTypes = {
    type: PropTypes.string.isRequired,
    status: PropTypes.string
};

// Helper to render code interpreter/code output blocks
const renderCodeInterpreter = (content) => {
    if (!content) return null;
    if (typeof content === 'string') {
        // Try to parse as JSON
        try {
            const obj = JSON.parse(content);
            if (obj && obj.type === 'code_interpreter_call') {
                return (
                    <div className="my-2 p-2 bg-secondary rounded text-xs flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-muted-foreground" />
                        <span>Code Interpreter: <span className="font-mono">{obj.code}</span></span>
                        {obj.status && <span className="ml-2 text-muted-foreground">({obj.status})</span>}
                    </div>
                );
            }
        } catch { return null; }
    }
    return null;
};

// Helper to render web search citations
const renderCitations = (annotations) => {
    if (!Array.isArray(annotations)) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {annotations.filter(a => a.type === 'url_citation').map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs hover:underline">
                    <Link2 className="w-3 h-3" />
                    {a.title || a.url}
                </a>
            ))}
        </div>
    );
};

// Utility to extract code from message
function extractCode(message) {
    if (message?.raw?.code) return message.raw.code;
    if (message?.arguments) {
        try {
            const args = typeof message.arguments === 'string' ? JSON.parse(message.arguments) : message.arguments;
            return args?.code || '';
        } catch { return ''; }
    }
    return '';
}

// --- Tool Call Card UI (sent and response) ---
const renderToolCallCard = ({ toolName, status, args, output, isDone }) => {
    // Format arguments as a readable list
    let argList = null;
    if (args && typeof args === 'object' && !Array.isArray(args)) {
        const entries = Object.entries(args);
        if (entries.length > 0) {
            argList = (
                <ul className="list-disc pl-5 text-xs text-zinc-100">
                    {entries.map(([k, v]) => (
                        <li key={k}><span className="font-semibold">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                    ))}
                </ul>
            );
        }
    }
    // Clean output: remove curly braces and do not show if empty or just '{}'
    let cleanOutput = output;
    if (typeof cleanOutput === 'string') {
        cleanOutput = cleanOutput.trim();
        if (cleanOutput === '{}' || cleanOutput === '[]') cleanOutput = '';
        cleanOutput = cleanOutput.replace(/^[{[]\s*|\s*[}\]]$/g, '').trim();
    }
    return (
        <div className="rounded-lg px-3 py-2 max-w-[420px] relative group bg-zinc-900 border border-zinc-700 text-zinc-100 flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-base">{toolName}</span>
                <span className={cn(
                    'ml-2 px-2 py-0.5 rounded text-xs font-semibold',
                    status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                    status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                } title="Status">{status === 'done' ? '✓' : status === 'error' ? '!' : ''} {status}</span>
            </div>
            {argList && (
                <details className="mb-1 bg-zinc-800 rounded border border-zinc-700">
                    <summary className="cursor-pointer px-2 py-1 font-mono text-xs text-zinc-100 select-none">Arguments</summary>
                    {argList}
                </details>
            )}
            {cleanOutput && (
                <div className="text-sm whitespace-pre-line">
                    {cleanOutput}
                </div>
            )}
            {!isDone && (
                <div className="text-xs text-yellow-300 mt-1">Waiting for tool response...</div>
            )}
        </div>
    );
};

const ChatMessage = ({ message, onCopy, copiedStates }) => {
    if (!message) return null;
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isTool = message.role === 'tool';
    const isError = message.role === 'error' || message.type === 'error';
    const isStreaming = message.status === 'streaming';
    const eventType = message.type || message.role;
    let content = message.content;
    let tables = [];
    // Parse content for assistant/tool/code/citations
    if (typeof content === 'object') content = JSON.stringify(content, null, 2);
    content = String(content);
    if (!isUser && !isError) {
        try {
            const { text, blocks } = processLatex(content);
            marked.setOptions({
                highlight: function (code, lang) {
                    if (Prism.languages[lang]) {
                        return Prism.highlight(code, Prism.languages[lang], lang);
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
    }
    // Split for tables
    const parts = content.split(/<div data-table-id="([^"]+)"><\/div>/);
    const elements = [];
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            if (parts[i]) {
                elements.push(
                    <div
                        key={`text-${i}`}
                        className={cn(
                            'text-xs leading-relaxed break-words',
                            'prose prose-sm dark:prose-invert max-w-none',
                            'prose-headings:text-foreground prose-headings:font-semibold prose-headings:my-2',
                            'prose-p:text-foreground prose-p:my-1',
                            'prose-ul:text-foreground prose-ul:my-1',
                            'prose-ol:text-foreground prose-ol:my-1',
                            'prose-li:text-foreground prose-li:my-0.5',
                            'prose-strong:text-foreground prose-strong:font-semibold',
                            'prose-em:text-foreground prose-em:italic',
                            'prose-code:text-foreground prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-xs',
                            '[&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:w-[294px]',
                            '[&_pre]:scrollbar-thin [&_pre]:scrollbar-thumb-secondary [&_pre]:scrollbar-track-transparent',
                            'prose-pre:text-foreground prose-pre:bg-secondary prose-pre:p-2 prose-pre:my-2 prose-pre:rounded-md',
                            '[&_pre_code]:!text-xs [&_pre_code]:!leading-relaxed [&_pre_code]:block [&_pre_code]:w-full',
                            isStreaming && 'animate-pulse'
                        )}
                        dangerouslySetInnerHTML={{ __html: parts[i] }}
                        onClick={e => {
                            const copyButton = e.target.closest('[data-copy-button]');
                            if (copyButton) {
                                const pre = copyButton.parentElement.querySelector('pre');
                                const code = pre.querySelector('code');
                                if (code) {
                                    onCopy(code.textContent, copyButton.getAttribute('data-copy-button'));
                                }
                            }
                        }}
                    />
                );
            }
        } else {
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
    // Render details for each event type
    let details = null;
    let messageClass = "";
    if (eventType === 'tool_call_sent' || isTool) {
        // Always parse arguments as JSON if possible
        let parsedArgs = message.arguments;
        if (typeof parsedArgs === 'string') {
            try {
                parsedArgs = JSON.parse(parsedArgs);
            } catch {
                /* leave as string if parsing fails */
            }
        }
        const toolName = message.toolName || message.name || 'Tool';
        const status = message.status || message.toolState || 'called';
        details = renderToolCallCard({
            toolName,
            status,
            args: parsedArgs,
            output: '',
            isDone: status === 'done',
        });
        messageClass = 'rounded-lg px-3 py-2 max-w-[420px] relative group bg-zinc-900 border border-zinc-700 text-zinc-100';
    } else if (eventType === 'tool_call_response') {
        // User-oriented tool response card
        const resp = Array.isArray(message.toolResponses) ? message.toolResponses[0] : null;
        const toolNameRaw = message.toolName || message.name || (resp && resp.toolName) || (resp && resp.name);
        const toolName = toolNameRaw ? toolNameRaw.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()) : 'Action';
        const status = message.status || (resp && resp.status) || 'done';
        const output = resp && (typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output, null, 2));
        const args = message.arguments || (resp && resp.arguments);
        let parsedArgs = args;
        if (typeof parsedArgs === 'string') {
            try { parsedArgs = JSON.parse(parsedArgs); } catch { /* ignore */ }
        }
        details = renderToolCallCard({
            toolName,
            status,
            args: parsedArgs,
            output,
            isDone: status === 'done',
        });
        messageClass = 'rounded-lg px-3 py-2 max-w-[420px] relative group bg-zinc-900 border border-zinc-700 text-zinc-100';
    } else if (eventType === 'code_interpreter_result') {
        const code = extractCode(message);
        // Prefer real output if present
        const output = message.output || message.value || message.resultValue || (message.raw && (message.raw.output || message.raw.value));
        details = (
            <div className="text-xs mt-1">
                <div className="flex items-center gap-2 mb-1">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold">Code Interpreter Output</span>
                </div>
                {code && (
                    <details className="mb-2 bg-zinc-800 rounded border border-zinc-700">
                        <summary className="cursor-pointer px-2 py-1 font-mono text-xs text-blue-200 select-none">Show code</summary>
                        <pre className="bg-zinc-900 text-blue-100 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap border-0">
                            <code
                                className="language-python"
                                dangerouslySetInnerHTML={{
                                    __html: window.Prism ? window.Prism.highlight(code, window.Prism.languages.python, 'python') : code
                                }}
                            />
                        </pre>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 mb-2 mt-1 px-2 py-1 text-xs bg-secondary/80 hover:bg-secondary"
                            onClick={() => navigator.clipboard.writeText(code)}
                        >
                            <Copy className="h-3 w-3 inline mr-1" /> Copy code
                        </Button>
                    </details>
                )}
                {/* Show real output if present */}
                {output && (
                    <pre className="bg-zinc-900 text-green-200 rounded p-2 text-xs overflow-x-auto mb-2 whitespace-pre-wrap border border-zinc-800">
                        {output}
                    </pre>
                )}
                {Array.isArray(message.files) && message.files.length > 0 && (
                    <div className="mt-2">
                        <div className="font-semibold mb-1">Generated Files:</div>
                        <ul className="list-disc pl-5">
                            {message.files.map((file, i) => (
                                <li key={i} className="mb-1">
                                    {file.url ? (
                                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{file.name || `File ${i + 1}`}</a>
                                    ) : (
                                        <span>{file.name || `File ${i + 1}`}</span>
                                    )}
                                    {file.name && file.name.match(/\.(png|jpg|jpeg|gif|svg)$/i) && file.url && (
                                        <div className="mt-1"><img src={file.url} alt={file.name} className="max-h-48 rounded border" /></div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    } else if (isError) {
        details = (
            <div className="flex items-center gap-2 text-xs text-red-700 mt-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-semibold">Error:</span> {message.code && <span className="font-mono">[{message.code}]</span>} {message.content || message.message}
            </div>
        );
    }
    // For assistant messages, show citations and code interpreter output if present
    let extra = null;
    if (isAssistant && message.annotations) {
        extra = renderCitations(message.annotations);
    }
    if (isAssistant && message.content && message.content.includes('code_interpreter_call')) {
        extra = <>{extra}{renderCodeInterpreter(message.content)}</>;
    }
    // --- UI: Only show bubbles for user/tool/error, plain for assistant ---
    if (eventType === 'tool_call_sent') {
        messageClass = 'rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
    } else if (eventType === 'tool_call_response') {
        messageClass = 'rounded-lg px-3 py-2 max-w-[420px] relative group bg-zinc-900 border border-zinc-700 text-zinc-100';
    } else if (isTool) {
        messageClass = 'rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800';
    } else if (isUser) {
        messageClass = 'rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-primary text-primary-foreground dark:bg-gray-900 dark:text-gray-100';
    } else if (isError) {
        messageClass = 'rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-red-50 border border-red-200';
    } else if (isAssistant) {
        messageClass = 'w-full bg-transparent p-0 shadow-none border-none'; // plain, no bubble
    } else {
        messageClass = 'rounded-lg px-3 py-1.5 max-w-[420px] relative group bg-muted';
    }
    return (
        <div
            id={`message-${message.id}`}
            className={cn(
                'mb-2 flex',
                isUser ? 'justify-end' : isTool ? 'justify-start' : 'justify-start'
            )}
        >
            <div className={messageClass}>
                {/* Only show badge for tool/error, not for user or assistant */}
                {(isTool || isError) && (
                    <div className="flex items-center mb-1">
                        <EventBadge type={eventType} status={message.status} />
                        {isStreaming && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                    </div>
                )}
                {/* Main content (text, code, tables, etc.) */}
                {isUser ? (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">{content}</div>
                ) : (
                    <>{elements}</>
                )}
                {/* Details for event type */}
                {details}
                {/* Extra info for assistant (citations, code, etc.) */}
                {extra}
                {/* Copy button for non-user messages */}
                {!isUser && message.content && (isTool || isError) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 flex items-center gap-1 bg-secondary/80 hover:bg-secondary"
                        onClick={() => onCopy(message.content, message.id)}
                    >
                        {copiedStates[message.id] ? (
                            <>
                                <Check className="h-3 w-3" />
                                <span className="text-xs">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="h-3 w-3" />
                                <span className="text-xs">Copy</span>
                            </>
                        )}
                    </Button>
                )}
                {isStreaming && (isTool || isError) && (
                    <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-blink" />
                )}
            </div>
        </div>
    );
};

ChatMessage.propTypes = {
    message: PropTypes.object.isRequired,
    onCopy: PropTypes.func.isRequired,
    copiedStates: PropTypes.object.isRequired
};

export default ChatMessage; 