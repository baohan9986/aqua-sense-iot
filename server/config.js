module.exports = {
    // 串口配置（本地开发用）
    SERIAL_PORT: '/dev/tty.usbmodem101',
    BAUD_RATE: 115200,

    // MQTT 配置（远程部署用）
    USE_MQTT: false, // 本地开发为 false，远程部署改为 true
    MQTT_BROKER_URL: 'mqtt://broker.hivemq.com',
    MQTT_TOPIC: 'iot/liquid/sensor1'
};