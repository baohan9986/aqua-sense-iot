const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { SERIAL_PORT, BAUD_RATE } = require('./config');

function createSerial(onData) {
    const port = new SerialPort({
        path: SERIAL_PORT,
        baudRate: BAUD_RATE
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line) => {
        try {
            const json = JSON.parse(line);
            console.log('串口数据:', json);
            onData(json);
        } catch (err) {
            console.error('解析错误:', line);
        }
    });

    return port;
}

module.exports = createSerial;