import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler } from 'chart.js';

// Register necessary Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Filler);

export class ChartManager {
    constructor(context, config, maxDataPoints = 500) { // Default maximum data points set to 100
        this.context = context; // This is the canvas context
        this.config = config; // Configuration for the chart
        this.chart = new Chart(this.context, this.config);
        this.maxDataPoints = maxDataPoints; // Maximum number of data points to store
    }

    updateData(label, data) {
        if (this.chart) {
            // Add new label and data
            this.chart.data.labels.push(label);
            this.chart.data.datasets.forEach((dataset, index) => {
                dataset.data.push(data[index]);
            });

            // Check if we need to remove the oldest data
            if (this.chart.data.labels.length > this.maxDataPoints) {
                this.chart.data.labels.shift(); // Remove the first label
                this.chart.data.datasets.forEach(dataset => {
                    dataset.data.shift(); // Remove the first data point from each dataset
                });
            }

            this.chart.update('none');
        }
    }

    resetData() {
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            this.chart.update('none');
        }
    }
}
