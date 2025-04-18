// Utility functions for chat message rendering
import katex from 'katex';

// Process LaTeX in text
export const processLatex = (text) => {
    const latexBlocks = [];
    let index = 0;
    const createPlaceholder = (latex, isDisplay) => {
        const placeholder = `%%%LATEX${index}%%%`;
        latexBlocks.push({ placeholder, latex, isDisplay });
        index++;
        return placeholder;
    };
    try {
        let processedText = text.replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g, (match, tex1, tex2) => {
            const tex = tex1 || tex2;
            return createPlaceholder(tex, true);
        });
        processedText = processedText.replace(/\\\(([^)]+?)\\\)|\$([^$\n]+?)\$/g, (match, tex1, tex2) => {
            const tex = tex1 || tex2;
            return createPlaceholder(tex, false);
        });
        return { text: processedText, blocks: latexBlocks };
    } catch {
        return { text, blocks: [] };
    }
};

export const renderLatexBlocks = (text, blocks) => {
    let result = text;
    for (const { placeholder, latex, isDisplay } of blocks) {
        try {
            const rendered = katex.renderToString(latex.trim(), {
                displayMode: isDisplay,
                throwOnError: false,
                strict: false,
                trust: true
            });
            const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp(escapedPlaceholder, 'g'), rendered);
        } catch {
            const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(
                new RegExp(escapedPlaceholder, 'g'),
                isDisplay ? `$$${latex}$$` : `$${latex}$`
            );
        }
    }
    return result;
};

export const processCodeBlocks = (content) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const preElements = doc.querySelectorAll('pre');
    preElements.forEach((pre, index) => {
        const code = pre.querySelector('code');
        if (code) {
            const wrapper = doc.createElement('div');
            wrapper.className = 'relative group';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            const button = doc.createElement('button');
            button.className = 'absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs shadow-sm hover:bg-primary/90';
            button.setAttribute('data-copy-button', `code-${index}`);
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>';
            wrapper.appendChild(button);
        }
    });
    return doc.body.innerHTML;
};

export const extractTables = (content) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const tables = [];
    const tableElements = doc.querySelectorAll('table');
    tableElements.forEach((table, index) => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
        );
        const data = rows.map(row =>
            Object.fromEntries(headers.map((header, i) => [header, row[i]]))
        );
        tables.push({ id: `table-${index}`, data });
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-table-id', `table-${index}`);
        table.parentNode.replaceChild(placeholder, table);
    });
    return { content: doc.body.innerHTML, tables };
}; 