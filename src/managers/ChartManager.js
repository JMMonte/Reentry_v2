import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler } from 'chart.js';

// Register necessary Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler);

// Adding the CSS rules to the document head
const styles = `
    body { margin: 0; overflow: hidden; }
    .chartContainer {
        width: 400px;
        height: 300px;
        border: 1px solid #ddd;
        background-color: #121212;
        border-radius: 5px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.05);
        position: absolute;
        display: flex;
        flex-direction: column;
        display: none; /* Start hidden */
    }

    .chartHeader {
        cursor: move;
        background-color: #232323;
        color: #E0E0E0;
        padding: 10px;
        border-top-left-radius: 5px;
        border-top-right-radius: 5px;
        user-select: none;
    }

    .chartTitle {
        display: inline-block;
        vertical-align: middle;
        font-family: sans-serif;
    }

    .minimizeChart {
        float: right;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: bold;
        color: #E0E0E0;
    }

    canvas { 
        flex: 1;
        display: block; 
    }
`;

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

const chartConfig = {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Altitude',
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                data: [],
                yAxisID: 'y-altitude'
            },
            {
                label: 'Velocity',
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                data: [],
                yAxisID: 'y-velocity'
            },
            {
                label: 'Acceleration',
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                data: [],
                yAxisID: 'y-acceleration'
            },
            {
                label: 'Drag Force',
                borderColor: 'rgb(255, 205, 86)',
                backgroundColor: 'rgba(255, 205, 86, 0.5)',
                data: [],
                yAxisID: 'y-drag'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        title: {
            display: true,
            text: 'Satellite Data'
        },
        tooltips: {
            enabled: false,
        },
        hover: {
            mode: 'nearest',
            intersect: true
        },
        scales: {
            x: {
                type: 'linear',
                position: 'bottom'
            },
            'y-altitude': {
                type: 'linear',
                position: 'left',
                id: 'y-altitude',
            },
            'y-velocity': {
                type: 'linear',
                position: 'right',
                id: 'y-velocity',
                offset: true,
            },
            'y-acceleration': {
                type: 'linear',
                position: 'right',
                id: 'y-acceleration',
            },
            'y-drag': {
                type: 'linear',
                position: 'right',
                id: 'y-drag',
            }
        },
        plugins: {
            legend: {
                display: false,
            }
        },
        animation: {
            duration: 0 // No animation
        },
        elements: {
            point: {
                radius: 0
            },
            line: {
                tension: 0
            }
        }
    }
};

class ChartManager {
    constructor(context, config = chartConfig, maxDataPoints = 500) {
        this.context = context;
        this.config = JSON.parse(JSON.stringify(config)); // Deep copy to prevent mutation
        this.chart = new Chart(this.context, this.config);
        this.maxDataPoints = maxDataPoints; // Maximum number of data points to store
    }

    addDataset(label, color) {
        const newDataset = {
            label: label,
            borderColor: color,
            backgroundColor: `${color}33`, // Lighter background color
            data: [],
            yAxisID: `y-${label.toLowerCase()}`,
        };
        this.chart.data.datasets.push(newDataset);
        this.chart.update();
    }

    removeDataset(label) {
        const datasetIndex = this.chart.data.datasets.findIndex(dataset => dataset.label === label);
        if (datasetIndex !== -1) {
            this.chart.data.datasets.splice(datasetIndex, 1);
            this.chart.update();
        }
    }

    updateData(label, timestamp, data) {
        const dataset = this.chart.data.datasets.find(dataset => dataset.label === label);
        if (dataset) {
            dataset.data.push({ x: timestamp, y: data });
            if (dataset.data.length > this.maxDataPoints) {
                dataset.data.shift(); // Remove the first data point to keep the length within maxDataPoints
            }
            this.chart.update();
        }
    }

    resetData(label) {
        const dataset = this.chart.data.datasets.find(dataset => dataset.label === label);
        if (dataset) {
            dataset.data = [];
            this.chart.update();
        }
    }
}

class ChartManagerWindow {
    constructor(containerId, title) {
        this.containerId = containerId;
        this.title = title;
        this.chartContainer = this.createChartContainer();
        this.initChartFunctions();
        this.chartManager = new ChartManager(this.chartContainer.querySelector('.dataChart').getContext('2d'));
    }

    createChartContainer() {
        const chartContainer = document.createElement('div');
        chartContainer.id = this.containerId;
        chartContainer.className = 'chartContainer';
        chartContainer.innerHTML = `
            <div class="chartHeader">
                <span class="chartTitle">${this.title}</span>
                <button class="minimizeChart">-</button>
            </div>
            <canvas class="dataChart"></canvas>
            <div class="resizeHandle"></div>
        `;
        document.body.appendChild(chartContainer);
        return chartContainer;
    }

    initChartFunctions() {
        const chartHeader = this.chartContainer.querySelector('.chartHeader');
        const resizeHandle = this.chartContainer.querySelector('.resizeHandle');
        const minimizeChartButton = this.chartContainer.querySelector('.minimizeChart');

        chartHeader.onmousedown = (event) => this.dragMouseDown(event, this.chartContainer);
        resizeHandle.onmousedown = (event) => this.resizeMouseDown(event, this.chartContainer);
        minimizeChartButton.onclick = () => this.toggleMinimize();
    }

    toggleMinimize() {
        const isMinimized = this.chartContainer.style.height === '40px';
        this.chartContainer.style.height = isMinimized ? '300px' : '40px';
        this.chartContainer.querySelector('.dataChart').style.visibility = isMinimized ? 'visible' : 'hidden';
        this.chartContainer.querySelector('.minimizeChart').textContent = isMinimized ? '-' : '+';
        this.updateCanvasSize();
    }

    updateCanvasSize() {
        const containerHeight = this.chartContainer.clientHeight;
        const headerHeight = this.chartContainer.querySelector('.chartHeader').offsetHeight;
        const availableHeight = containerHeight - headerHeight;
        const dataChart = this.chartContainer.querySelector('.dataChart');
        dataChart.style.height = `${availableHeight}px`;
        dataChart.width = this.chartContainer.clientWidth;
        dataChart.height = availableHeight;
    }

    dragMouseDown(e, container) {
        e.preventDefault();
        let startPosX = e.clientX, startPosY = e.clientY;

        const doDrag = (event) => {
            container.style.left = `${container.offsetLeft + event.clientX - startPosX}px`;
            container.style.top = `${container.offsetTop + event.clientY - startPosY}px`;
            startPosX = event.clientX;
            startPosY = event.clientY;
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }

    resizeMouseDown(e, container) {
        e.preventDefault();
        let startX = e.clientX;
        let startY = e.clientY;
        let startWidth = parseInt(window.getComputedStyle(container).width, 10);
        let startHeight = parseInt(window.getComputedStyle(container).height, 10);

        const doResize = (event) => {
            container.style.width = `${startWidth + event.clientX - startX}px`;
            container.style.height = `${startHeight + event.clientY - startY}px`;
            this.updateCanvasSize();
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        };

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    remove() {
        this.chartContainer.parentNode.removeChild(this.chartContainer);
    }

    updateData(label, time, data) {
        this.chartManager.updateData(label, time, data);
    }

    addDataset(label, color) {
        this.chartManager.addDataset(label, color);
    }

    removeDataset(label) {
        this.chartManager.removeDataset(label);
    }

    resetData(label) {
        this.chartManager.resetData(label);
    }
}

export { ChartManagerWindow };
