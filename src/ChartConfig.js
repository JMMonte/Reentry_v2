export const chartConfig = {
    type: 'line',
    data: {
        labels: [], // no initial labels
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
                display: true,
                position: 'top',
                labels: {
                    color: 'rgb(255, 99, 132)', // You can set a universal color or use default
                    font: {
                        size: 14 // Sets the font size of the labels in the legend
                    }
                }
            }
        },
        animation: {
            duration: 0 // No animation
        }
    }
};
