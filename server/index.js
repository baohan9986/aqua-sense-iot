const express = require('express');
const http = require('http');
const path = require('path');
const createSerial = require('./serial');
const setupWebSocket = require('./websocket');
const { determineStatusWithGPT2 } = require('./openai');

const app = express();
const server = http.createServer(app);
const ws = setupWebSocket(server);

// Store historical sensor data
const sensorHistory = [];
const MAX_HISTORY = 100; // Limit history size

// 启动串口读取
createSerial(async (data) => {
    try {
        // Use GPT-2 model to determine status
        if (data.tds !== undefined && data.ntu !== undefined &&
            data.ph !== undefined && data.temp !== undefined) {

            // Get status from GPT-2 model
            const status = await determineStatusWithGPT2(data);

            // Add status to data
            data.status = status;
            console.log('Status determined by GPT-2:', status);
        }

        // Store data with timestamp
        const dataWithTimestamp = {
            ...data,
            timestamp: new Date()
        };

        // Add to history and limit size
        sensorHistory.push(dataWithTimestamp);
        if (sensorHistory.length > MAX_HISTORY) {
            sensorHistory.shift();
        }

        // Broadcast to all connected clients
        ws.broadcast(data);
        console.log('Broadcasting data:', data);
    } catch (error) {
        console.error('Error processing sensor data:', error);
    }
});

// Add API endpoint for fetching historical data
app.get('/data', (req, res) => {
    res.json(sensorHistory);
});

// 提供前端页面访问
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`服务运行中: http://localhost:${PORT}`);
});