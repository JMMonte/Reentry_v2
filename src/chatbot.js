document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const chatBox = document.getElementById('chat-box');
    const chatForm = document.getElementById('chat-form');

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
            currentAssistantMessage.textContent += data.textDelta;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        if (data.end) {
            currentAssistantMessage = null;
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
    };

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
        messageElement.textContent = text;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});
