// chatbot.js
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

    // Display Options
    const displayOptions = [
        { key: 'showGrid', name: 'Grid', icon: 'bx-grid-alt' },
        { key: 'showVectors', name: 'Vectors', icon: 'bx-move' },
        { key: 'showSatVectors', name: 'Sat Vectors', icon: 'bx-radio-circle-marked' },
        { key: 'showSurfaceLines', name: 'Surface Lines', icon: 'bx-landscape' },
        { key: 'showOrbits', name: 'Sat Orbits', icon: 'bx-circle' },
        { key: 'showTraces', name: 'Sat Traces', icon: 'bx-line-chart' },
        { key: 'showGroundTraces', name: 'Ground Traces', icon: 'bx-map-alt' },
        { key: 'showCities', name: 'Cities', icon: 'bx-buildings' },
        { key: 'showAirports', name: 'Airports', icon: 'bx-plane' },
        { key: 'showSpaceports', name: 'Spaceports', icon: 'bx-rocket' },
        { key: 'showObservatories', name: 'Observatories', icon: 'bx-telescope' },
        { key: 'showGroundStations', name: 'Ground Stations', icon: 'bx-broadcast' },
        { key: 'showCountryBorders', name: 'Country Borders', icon: 'bx-border-all' },
        { key: 'showStates', name: 'States', icon: 'bx-map' },
        { key: 'showMoonOrbit', name: 'Moon Orbit', icon: 'bx-moon' },
        { key: 'showMoonTraces', name: 'Moon Trace Lines', icon: 'bx-line-chart' },
        { key: 'showMoonSurfaceLines', name: 'Moon Surface Lines', icon: 'bx-landscape' }
    ];

    const displayOptionsWindow = document.getElementById('display-options-window');
    const toggleDisplayOptionsBtn = document.getElementById('toggle-display-options');


    toggleDisplayOptionsBtn.addEventListener('click', () => {
        displayOptionsWindow.classList.toggle('visible');
    });

    displayOptions.forEach(option => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option-toggle';
        optionElement.innerHTML = `
            <input type="checkbox" id="${option.key}" name="${option.key}">
            <label for="${option.key}"><i class='bx ${option.icon}'></i>${option.name}</label>
        `;
        displayOptionsWindow.appendChild(optionElement);

        const checkbox = optionElement.querySelector('input');
        checkbox.addEventListener('change', (event) => {
            handleOptionChange(option.key, event.target.checked);
        });
    });

    function handleOptionChange(key, value) {
        console.log(`Option changed: ${key} is now ${value}`);
        // Dispatch a custom event to update the display setting
        document.dispatchEvent(new CustomEvent('updateDisplaySetting', {
            detail: { key, value }
        }));
    }

    // Function to apply settings
    function applySettings(settings) {
        displayOptions.forEach(option => {
            const checkbox = document.getElementById(option.key);
            if (checkbox && settings.hasOwnProperty(option.key)) {
                checkbox.checked = settings[option.key];
            }
        });
    }

    // Listen for the response with the current display settings
    document.addEventListener('displaySettingsResponse', (event) => {
        const currentSettings = event.detail;
        applySettings(currentSettings);
    });

    // Time Warp Controls
    const decreaseTimeWarpBtn = document.getElementById('decrease-time-warp');
    const increaseTimeWarpBtn = document.getElementById('increase-time-warp');
    const resetTimeWarpBtn = document.getElementById('reset-time-warp');
    const currentTimeWarpSpan = document.getElementById('current-time-warp');
    const currentTimeSpan = document.getElementById('current-time');

    const timeWarpOptions = [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
    let currentTimeWarpIndex = 1; // Start at 1x

    function updateTimeWarpDisplay() {
        const currentValue = timeWarpOptions[currentTimeWarpIndex];
        currentTimeWarpSpan.textContent = currentValue + 'x';
        document.dispatchEvent(new CustomEvent('updateTimeWarp', { detail: { value: currentValue } }));
    }

    decreaseTimeWarpBtn.addEventListener('click', () => {
        if (currentTimeWarpIndex > 0) {
            currentTimeWarpIndex--;
            updateTimeWarpDisplay();
        }
    });

    increaseTimeWarpBtn.addEventListener('click', () => {
        if (currentTimeWarpIndex < timeWarpOptions.length - 1) {
            currentTimeWarpIndex++;
            updateTimeWarpDisplay();
        }
    });

    resetTimeWarpBtn.addEventListener('click', () => {
        currentTimeWarpIndex = 1; // Reset to 1x
        updateTimeWarpDisplay();
    });

    // Listen for time updates from the main app
    document.addEventListener('timeUpdate', (event) => {
        const { simulatedTime } = event.detail;
        currentTimeSpan.textContent = new Date(simulatedTime).toLocaleString();
    });

    // Notify the main app that the chat sidebar is ready
    document.dispatchEvent(new CustomEvent('chatSidebarReady'));

    // Function to apply initial settings
    function applyInitialSettings() {
        // Dispatch a custom event to get the current display settings
        document.dispatchEvent(new CustomEvent('getDisplaySettings'));
    }

    // Call this function to set up initial state
    applyInitialSettings();
});