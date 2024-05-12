// WindowManager.js
export class WindowManager {
    constructor(document) {
        this.document = document;
        this.windows = {};
    }

    createWindow(id, title) {
        if (this.windows[id]) {
            return this.windows[id].canvas.getContext('2d'); // Return existing context if already created
        }

        const container = this.document.createElement('div');
        container.className = 'chartContainer';
        container.id = `chartContainer_${id}`;
        container.style.display = 'none';

        const header = this.document.createElement('div');
        header.className = 'chartHeader';

        const titleLabel = this.document.createElement('span');
        titleLabel.className = 'chartTitle';
        titleLabel.textContent = title;

        const minimizeButton = this.document.createElement('button');
        minimizeButton.className = 'minimizeChart';
        minimizeButton.textContent = '-';
        minimizeButton.onclick = () => this.toggleWindow(id);

        const canvas = this.document.createElement('canvas');
        canvas.id = `dataChart_${id}`;

        header.appendChild(titleLabel);
        header.appendChild(minimizeButton);
        container.appendChild(header);
        container.appendChild(canvas);
        this.document.body.appendChild(container);

        this.windows[id] = { container, canvas, isVisible: false };
        return canvas.getContext('2d');
    }

    deleteWindow(id) {
        if (this.windows[id]) {
            this.windows[id].container.remove();
            delete this.windows[id];
        }
    }

    showWindow(id) {
        if (this.windows[id] && !this.windows[id].isVisible) {
            this.windows[id].container.style.display = 'block';
            this.windows[id].isVisible = true;
        }
    }

    hideWindow(id) {
        if (this.windows[id] && this.windows[id].isVisible) {
            this.windows[id].container.style.display = 'none';
            this.windows[id].isVisible = false;
        }
    }

    toggleWindow(id) {
        if (this.windows[id].isVisible) {
            this.hideWindow(id);
        } else {
            this.showWindow(id);
        }
    }
}
