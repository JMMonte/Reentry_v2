import { marked } from 'marked';

// Configure marked to disable headerIds
marked.setOptions({
    headerIds: false
});

// Custom renderer to handle LaTeX
const renderer = new marked.Renderer();
renderer.paragraph = (text) => {
    const latexRegex = /\$\$([\s\S]+?)\$\$/g;
    const parts = text.split(latexRegex);
    let result = '';
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            // Regular text
            result += parts[i];
        } else {
            // LaTeX
            try {
                const latex = katex.renderToString(parts[i], { displayMode: true });
                result += `<div class="latex-block">${latex}</div>`;
            } catch (error) {
                console.error('LaTeX rendering error:', error);
                result += `<div class="latex-block error">LaTeX rendering error: ${parts[i]}</div>`;
            }
        }
    }
    return `<p>${result}</p>`;
};

marked.setOptions({ renderer });

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const chatBox = document.getElementById('chat-box');
    const chatForm = document.getElementById('chat-form');
    const resizeHandle = document.getElementById('resize-handle');
    const chatSidebar = document.getElementById('chat-sidebar');
    const toggleButton = document.getElementById('toggle-chat-button');
    let isResizing = false;

    const eventSource = new EventSource('http://localhost:3000/events');
    let currentAssistantMessage = null;

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.isNewMessage) {
            currentAssistantMessage = document.createElement('div');
            currentAssistantMessage.className = 'assistant-message';
            chatBox.appendChild(currentAssistantMessage);
        }
        if (!currentAssistantMessage) {
            currentAssistantMessage = document.createElement('div');
            currentAssistantMessage.className = 'assistant-message';
            chatBox.appendChild(currentAssistantMessage);
        }
        if (data.textDelta) {
            // Accumulate the markdown text
            currentAssistantMessage.dataset.markdown = (currentAssistantMessage.dataset.markdown || '') + data.textDelta;
            // Render the accumulated markdown
            currentAssistantMessage.innerHTML = marked(currentAssistantMessage.dataset.markdown);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        if (data.end) {
            currentAssistantMessage = null;
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
    };

    // Resizing logic
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
    });

    function resize(e) {
        if (isResizing) {
            const newWidth = e.clientX;
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }

    // Chat form submission
    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = chatInput.value;
        if (message.trim() === '') return;

        appendMessage('user-message', message);
        chatInput.value = '';

        try {
            const response = await fetch('http://localhost:3000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            const data = await response.json();
            console.log('Response:', data.reply);
        } catch (error) {
            console.error('Error:', error);
        }
    });

    function appendMessage(role, text) {
        const messageElement = document.createElement('div');
        messageElement.className = role;
        // Render the message as markdown with LaTeX support
        messageElement.innerHTML = marked(text);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Toggle chat sidebar
    toggleButton.addEventListener('click', () => {
        chatSidebar.classList.toggle('visible');
    });
});
