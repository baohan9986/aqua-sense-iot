const mqtt = require('mqtt');
const { MQTT_BROKER_URL, MQTT_TOPIC } = require('./config');

function createMQTTClient(onData) {
    const client = mqtt.connect(MQTT_BROKER_URL);

    client.on('connect', () => {
        console.log('已连接 MQTT 服务器');
        client.subscribe(MQTT_TOPIC);
    });

    client.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('MQTT 收到数据:', data);
            onData(data);
        } catch (err) {
            console.error('MQTT 数据解析错误:', message.toString());
        }
    });
}

module.exports = createMQTTClient;