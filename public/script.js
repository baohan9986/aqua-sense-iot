document.addEventListener("DOMContentLoaded", function () {
    // Initialize time update and chart variables
    initializeCharts();
    updateDateTime();
    setInterval(updateDateTime, 1000);
    setupEventListeners();

    // Connect to WebSocket server
    setupWebSocketConnection();
});

// WebSocket connection
let ws;

function setupWebSocketConnection() {
    // Create WebSocket connection
    ws = new WebSocket(`ws://${window.location.host}`);

    // Connection opened
    ws.addEventListener('open', function () {
        console.log('Connected to WebSocket server');
    });

    // Listen for messages
    ws.addEventListener('message', function (event) {
        try {
            const data = JSON.parse(event.data);
            console.log("📊 传感器数据:", data);
            updateSensorValues(data);
            updateCharts(data);
        } catch (error) {
            console.error('Error parsing WebSocket data:', error);
        }
    });

    // Handle connection errors
    ws.addEventListener('error', function (error) {
        console.error('WebSocket Error:', error);
    });

    // Reconnect on close
    ws.addEventListener('close', function () {
        console.log('WebSocket connection closed. Reconnecting...');
        setTimeout(setupWebSocketConnection, 3000);
    });
}

function updateSensorValues(data) {
    // Update UI with received sensor data
    if (data.temp !== undefined) document.getElementById('tempValue').innerText = data.temp.toFixed(1);
    if (data.tds !== undefined) document.getElementById('tdsValue').innerText = Math.round(data.tds);
    if (data.ntu !== undefined) document.getElementById('ntuValue').innerText = Math.round(data.ntu);
    if (data.ph !== undefined) document.getElementById('phValue').innerText = data.ph.toFixed(2);

    // Update status if present
    if (data.status) {
        const statusElement = document.getElementById('currentStatus');
        if (statusElement) {
            statusElement.innerText = data.status;

            // Update status color based on value
            if (data.status === "GOOD") {
                statusElement.style.color = "#2ECC71"; // Green
            } else if (data.status === "ALERT") {
                statusElement.style.color = "#F39C12"; // Yellow/Orange
            } else if (data.status === "BAD") {
                statusElement.style.color = "#E74C3C"; // Red
            }
        }
    }

    // Update progress bar indicators
    updateSensorProgressBars(data);
}

function updateSensorProgressBars(data) {
    // Update progress bars based on new data
    if (data.ph !== undefined) {
        const phProgressBar = document.querySelector('#phValue').closest('.data-card').querySelector('.progress-bar');
        updateProgressBarIndicator(phProgressBar, data.ph, 0, 14);
    }

    if (data.temp !== undefined) {
        const tempProgressBar = document.querySelector('#tempValue').closest('.data-card').querySelector('.progress-bar');
        updateProgressBarIndicator(tempProgressBar, data.temp, 20, 30);
    }

    if (data.tds !== undefined) {
        const tdsProgressBar = document.querySelector('#tdsValue').closest('.data-card').querySelector('.progress-bar');
        updateProgressBarIndicator(tdsProgressBar, data.tds, 0, 200);
    }

    if (data.ntu !== undefined) {
        const ntuProgressBar = document.querySelector('#ntuValue').closest('.data-card').querySelector('.progress-bar');
        updateProgressBarIndicator(ntuProgressBar, data.ntu, 0, 100);
    }
}

function updateCharts(data) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const displayTime = `${dateString} ${timeString}`;

    // Add data to charts if values exist
    if (data.ph !== undefined) {
        updatePhChart(data.ph, displayTime, now);
    }

    if (data.temp !== undefined) {
        updateTempChart(data.temp, displayTime, now);
    }

    if (data.tds !== undefined) {
        updateTdsChart(data.tds, displayTime, now);
    }

    if (data.ntu !== undefined) {
        updateTurbidityChart(data.ntu, displayTime, now);
    }

    // Limit chart data points
    if (timeLabels.length > maxDataPoints) {
        timeLabels.shift();
        phValues.shift();
        tempValues.shift();
        tdsValues.shift();
        turbidityValues.shift();
        turbidityTimeStamps.shift();
    }
}

// Chart-related variables
let phChart, tempChart, tdsChart, turbidityChart;
let phValues = [];
let tempValues = [];
let tdsValues = [];
let turbidityValues = [];
let timeLabels = [];
let turbidityTimeStamps = [];
let lastPhUpdateTime = 0;
let lastTempUpdateTime = 0;
let lastTdsUpdateTime = 0;
let lastTurbidityUpdateTime = 0;
let pendingPhUpdate = false;
let pendingTempUpdate = false;
let pendingTdsUpdate = false;
let pendingTurbidityUpdate = false;
const maxDataPoints = 20;
const maxWeeklyPoints = 168; // 24 hours * 7 days, for hourly data

let phChartUpdatePending = false;
let tempChartUpdatePending = false;
let tdsChartUpdatePending = false;
let turbidityChartUpdatePending = false;

function initializeCharts() {
    // Initialize pH Chart
    phChart = new Chart(document.getElementById('phChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'pH Value',
                data: [],
                borderColor: '#0077B6',
                backgroundColor: 'rgba(173, 232, 244, 0.5)',
                borderWidth: 2,
                pointRadius: 0.2,
                pointBackgroundColor: '#0077B6',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 14, // pH scale is 0-14
                    title: {
                        display: true,
                        text: 'pH Value'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: {
                duration: 0
            }
        }
    });

    // Initialize Temperature Chart
    tempChart = new Chart(document.getElementById('tempChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature °C',
                data: [],
                backgroundColor: 'rgba(144, 224, 239, 0.8)',
                borderColor: '#0077B6',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    grace: '10%',
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    },
                    ticks: {
                        precision: 1
                    },
                    min: 0,
                    max: 30,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: false
        }
    });

    // Initialize TDS Chart
    tdsChart = new Chart(document.getElementById('tdsChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'TDS (ppm)',
                data: [],
                backgroundColor: 'rgba(144, 224, 239, 0.8)',
                borderColor: '#0077B6',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    grace: '10%',
                    title: {
                        display: true,
                        text: 'TDS (ppm)'
                    },
                    ticks: {
                        precision: 0
                    },
                    min: 0,
                    max: 1000,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: false
        }
    });

    // Initialize Turbidity Chart
    turbidityChart = new Chart(document.getElementById('turbidityChart'), {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Turbidity Readings',
                    data: [],
                    backgroundColor: 'rgba(144, 224, 239, 0.8)',
                    borderColor: '#0077B6',
                    borderWidth: 2,
                    pointRadius: 1,
                    pointHoverRadius: 8
                },
                {
                    label: 'Trend Line',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(0, 119, 182, 0.8)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Time'
                    },

                    ticks: {
                        callback: function (value) {
                            return value.toFixed(0);
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Turbidity (NTU)'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const index = context.dataIndex;
                            if (context.dataset.label === 'Turbidity Readings') {
                                return `Turbidity: ${context.parsed.y.toFixed(2)} NTU`;
                            }
                            return `Trend: ${context.parsed.y.toFixed(2)} NTU`;
                        }
                    }
                }
            },
            animation: false
        }
    });
}

function setupEventListeners() {
    // Button toggle functionality
    const toggleButtons = document.querySelectorAll('.toggle-buttons .btn');
    const savedButton = localStorage.getItem('activeButton');

    if (savedButton) {
        toggleButtons.forEach(btn => {
            if (btn.textContent === savedButton) {
                toggleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    }

    toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            localStorage.setItem('activeButton', this.textContent);

            if (this.textContent === 'Data') {
                console.log('Data view active');
                document.querySelector('.data-container').style.display = 'grid';
            }
        });
    });

    // Update status box last-minute text
    const statusLastMinute = document.querySelector('.status-box .last-minute');
    if (statusLastMinute) {
        statusLastMinute.textContent = "Last 1 minute";
    }

    // Chart icon click handlers
    setupChartIconHandlers();
}

function setupChartIconHandlers() {
    // pH icon click handler
    const phIcon = document.querySelector('.data-card:first-child .material-symbols-outlined');
    const phChartContainer = document.getElementById('phChartContainer');
    const chartOverlay = document.querySelector('.chart-overlay');
    const closeChart = document.querySelector('.close-chart');

    phIcon.addEventListener('click', function () {
        phChartContainer.classList.toggle('active');
        chartOverlay.classList.toggle('active');
        document.body.style.overflow = phChartContainer.classList.contains('active') ? 'hidden' : '';
    });

    closeChart.addEventListener('click', function () {
        phChartContainer.classList.remove('active');
        chartOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // Temperature icon click handler
    const tempIcon = document.querySelector('.data-card:nth-child(2) .material-symbols-outlined');
    const tempChartContainer = document.getElementById('tempChartContainer');
    const closeTempChart = document.querySelector('.close-temp-chart');

    tempIcon.addEventListener('click', function () {
        tempChartContainer.classList.toggle('active');
        chartOverlay.classList.toggle('active');
        document.body.style.overflow = tempChartContainer.classList.contains('active') ? 'hidden' : '';
    });

    closeTempChart.addEventListener('click', function () {
        tempChartContainer.classList.remove('active');
        chartOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // TDS icon click handler
    const tdsIcon = document.querySelector('.data-card:nth-child(3) .material-symbols-outlined');
    const tdsChartContainer = document.getElementById('tdsChartContainer');
    const closeTdsChart = document.querySelector('.close-tds-chart');

    tdsIcon.addEventListener('click', function () {
        tdsChartContainer.classList.toggle('active');
        chartOverlay.classList.toggle('active');
        document.body.style.overflow = tdsChartContainer.classList.contains('active') ? 'hidden' : '';
    });

    closeTdsChart.addEventListener('click', function () {
        tdsChartContainer.classList.remove('active');
        chartOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // Turbidity icon click handler
    const turbidityIcon = document.querySelector('.data-card:nth-child(4) .material-symbols-outlined');
    const turbidityChartContainer = document.getElementById('turbidityChartContainer');
    const closeTurbidityChart = document.querySelector('.close-turbidity-chart');

    turbidityIcon.addEventListener('click', function () {
        turbidityChartContainer.classList.toggle('active');
        chartOverlay.classList.toggle('active');
        document.body.style.overflow = turbidityChartContainer.classList.contains('active') ? 'hidden' : '';
    });

    closeTurbidityChart.addEventListener('click', function () {
        turbidityChartContainer.classList.remove('active');
        chartOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // Click outside to close
    chartOverlay.addEventListener('click', function () {
        document.querySelectorAll('.chart-container').forEach(container => {
            container.classList.remove('active');
        });
        chartOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });
}

// Date and time update function
function updateDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();

    document.getElementById('current-date').textContent = date;
    document.getElementById('current-time').textContent = time;
}

// Helper function to calculate linear regression
function calculateRegression(xValues, yValues) {
    const n = xValues.length;
    if (n <= 1) return { slope: 0, intercept: yValues[0] || 0, predict: x => yValues[0] || 0 };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
        sumX += xValues[i];
        sumY += yValues[i];
        sumXY += xValues[i] * yValues[i];
        sumXX += xValues[i] * xValues[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return {
        slope,
        intercept,
        predict: x => slope * x + intercept
    };
}

// Chart update functions
function updateProgressBar(progressBar, value, minValue, maxValue) {
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    progressBar.style.setProperty('--value', percentage);
}

function updateProgressBarIndicator(progressBar, value, minValue, maxValue) {
    const indicator = progressBar.querySelector('.indicator');
    const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
    indicator.style.left = `${percentage}%`;
}

function updatePhChart(value, displayTime, timestamp) {
    timeLabels.push(displayTime);
    phValues.push(value);

    if (!phChartUpdatePending) {
        phChartUpdatePending = true;
        requestAnimationFrame(() => {
            phChart.data.labels = timeLabels;
            phChart.data.datasets[0].data = phValues;
            phChart.update('none');
            phChartUpdatePending = false;
        });
    }

    lastPhUpdateTime = Date.now();
    pendingPhUpdate = false;
    updateDataTable('phDataTable', displayTime, value);

    // Update progress bar indicator
    const progressBar = document.querySelector('#phValue').closest('.data-card').querySelector('.progress-bar');
    updateProgressBarIndicator(progressBar, value, 0, 14);
}

function updateTempChart(value, displayTime, timestamp) {
    tempValues.push(value);

    if (!tempChartUpdatePending) {
        tempChartUpdatePending = true;
        requestAnimationFrame(() => {
            tempChart.data.labels = timeLabels;
            tempChart.data.datasets[0].data = tempValues;
            tempChart.update('none');
            tempChartUpdatePending = false;
        });
    }

    lastTempUpdateTime = Date.now();
    pendingTempUpdate = false;
    updateDataTable('tempDataTable', displayTime, `${value} °C`);

    // Update progress bar indicator
    const progressBar = document.querySelector('#tempValue').closest('.data-card').querySelector('.progress-bar');
    updateProgressBarIndicator(progressBar, value, 20, 30);
}

function updateTdsChart(value, displayTime, timestamp) {
    tdsValues.push(value);

    if (!tdsChartUpdatePending) {
        tdsChartUpdatePending = true;
        requestAnimationFrame(() => {
            tdsChart.data.labels = timeLabels;
            tdsChart.data.datasets[0].data = tdsValues;
            tdsChart.update('none');
            tdsChartUpdatePending = false;
        });
    }

    lastTdsUpdateTime = Date.now();
    pendingTdsUpdate = false;
    updateDataTable('tdsDataTable', displayTime, `${value} ppm`);

    // Update progress bar indicator
    const progressBar = document.querySelector('#tdsValue').closest('.data-card').querySelector('.progress-bar');
    updateProgressBarIndicator(progressBar, value, 0, 200);
}

function updateTurbidityChart(value, displayTime, timestamp) {
    turbidityValues.push(value);
    turbidityTimeStamps.push(timestamp.getTime());

    if (!turbidityChartUpdatePending) {
        turbidityChartUpdatePending = true;
        requestAnimationFrame(() => {
            const scatterData = turbidityValues.map((val, i) => ({
                x: (turbidityTimeStamps[i] - turbidityTimeStamps[0]) / 60000,
                y: val
            }));
            turbidityChart.data.datasets[0].data = scatterData;

            if (turbidityValues.length >= 2) {
                const xValues = scatterData.map(point => point.x);
                const yValues = turbidityValues.slice();
                const regression = calculateRegression(xValues, yValues);
                const regressionData = [
                    { x: Math.min(...xValues), y: regression.predict(Math.min(...xValues)) },
                    { x: Math.max(...xValues), y: regression.predict(Math.max(...xValues)) }
                ];
                turbidityChart.data.datasets[1].data = regressionData;
            }

            turbidityChart.update('none');
            turbidityChartUpdatePending = false;
        });
    }

    lastTurbidityUpdateTime = Date.now();
    pendingTurbidityUpdate = false;
    updateDataTable('turbidityDataTable', displayTime, `${value} NTU`);

    // Update progress bar indicator
    const progressBar = document.querySelector('#ntuValue').closest('.data-card').querySelector('.progress-bar');
    updateProgressBarIndicator(progressBar, value, 0, 100); // Assuming 0-100 NTU range
}

function updateDataTable(tableId, time, value) {
    const dataTable = document.getElementById(tableId);
    const dataRow = document.createElement('div');
    dataRow.className = 'data-row';
    dataRow.innerHTML = `
        <span>${time}</span>
        <span>${value}</span>
    `;

    // Insert at the top for newest data
    dataTable.insertBefore(dataRow, dataTable.firstChild);

    // Limit table rows
    while (dataTable.children.length > 100) {
        dataTable.removeChild(dataTable.lastChild);
    }

    // Auto-scroll to the top to show newest entries
    dataTable.scrollTop = 0;
}

// Throttle chart updates for performance with large datasets
setInterval(() => {
    if (pendingPhUpdate) {
        phChart.update('none');
        pendingPhUpdate = false;
        lastPhUpdateTime = Date.now();
    }
    if (pendingTempUpdate) {
        tempChart.update('none');
        pendingTempUpdate = false;
        lastTempUpdateTime = Date.now();
    }
    if (pendingTdsUpdate) {
        tdsChart.update('none');
        pendingTdsUpdate = false;
        lastTdsUpdateTime = Date.now();
    }
    if (pendingTurbidityUpdate) {
        turbidityChart.update('none');
        pendingTurbidityUpdate = false;
        lastTurbidityUpdateTime = Date.now();
    }
}, 1000);

