#include <WiFiNINA.h>
#include <ArduinoMqttClient.h>
#include "arduino_secrets.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define BASELINE_SAMPLES 20   // 设置基准样本数量
#define ALLOWED_VARIANCE 10.0 // 允许的最大标准差

// 存储基准数据
float tdsSamples[BASELINE_SAMPLES];
float ntuSamples[BASELINE_SAMPLES];
float phSamples[BASELINE_SAMPLES];
float tempSamples[BASELINE_SAMPLES];

// 计算基准均值
float baselineTDS = 0, baselineNTU = 0, baselinePH = 0, baselineTemp = 0;

// 计算标准差
float stdTDS = 0, stdNTU = 0, stdPH = 0, stdTemp = 0;

// 采样累计值
float sumTDS = 0, sumNTU = 0, sumPH = 0, sumTemp = 0;
float sumTDS2 = 0, sumNTU2 = 0, sumPH2 = 0, sumTemp2 = 0; // 用于计算方差

// 采样计数
int baselineSampleCount = 0;
bool baselineCalculated = false;
bool baselineInProgress = false;

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void updateOLEDStatus(String status)
{
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);

    int16_t x1, y1;
    uint16_t textWidth, textHeight;

    // **如果 status 为空或未定义，默认显示 "Preparing"**
    if (status == "" || status.length() == 0)
    {
        status = "Preparing";
    }

    // 计算 "Status:" 宽度，让它居中
    display.setTextSize(1);
    display.getTextBounds("Status:", 0, 0, &x1, &y1, &textWidth, &textHeight);
    int centerX = (128 - textWidth) / 2;
    display.setCursor(centerX, 15);
    display.print("Status:");

    // 计算状态文本宽度，让它居中
    display.setTextSize(2);
    display.getTextBounds(status, 0, 0, &x1, &y1, &textWidth, &textHeight);
    centerX = (128 - textWidth) / 2;
    display.setCursor(centerX, 35);
    display.print(status);

    display.display();
}

const int greenLED = 3;
const int yellowLED = 4;
const int redLED = 5;

WiFiSSLClient wifiClient;
MqttClient mqttClient(wifiClient);

// MQTT Configuration (Updated to use HiveMQ Cloud)
char broker[] = "fc4be08a479e4564bf0f1f4512c48df3.s1.eu.hivemq.cloud";
int port = 8883; // TLS port for secure connection
char mqttUsername[] = "liquid";
char mqttPassword[] = "Liquid012";

// MQTT Topics
char topicTDS[] = "tdsValue";
char topicTurbidity[] = "ntuValue";
char topicPH[] = "phValue";
char topicTemperature[] = "tempValue";
char topicStatus[] = "currentStatus";

String currentStatus = "WAITING";
String clientID = "Han";

// TDS Sensor Configuration
#define TdsSensorPin A1
#define VREF 5.0
#define SCOUNT 3
int analogBuffer[SCOUNT];
int analogBufferTemp[SCOUNT];
int analogBufferIndex = 0;
float averageVoltage = 0, tdsValue = 0, temperature = 25;

// Turbidity Sensor Configuration
#define TURBIDITY_PIN A0
float ntuValue = 0;

// pH Sensor Configuration
#define pHSensorPin A2
#define Offset 0.00
#define ArrayLength 3
int pHArray[ArrayLength];
int pHArrayIndex = 0;
float pHValue = 0, voltage = 0;

// Temperature Sensor Configuration
#define ONE_WIRE_BUS 2
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
float tempValue = 0;

// MQTT & Timing
long lastTimeSent = 0;
int interval = 60 * 1000;
long lastStatusSent = 0;

long warmupStartTime = 0;
bool warmupComplete = false; // 是否完成 20 秒稳定期

// WiFi Connection
void connectToNetwork()
{
    while (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("Attempting to connect to: " + String(SECRET_SSID));
        WiFi.begin(SECRET_SSID, SECRET_PASS);
        delay(2000);
    }
    Serial.print("Connected. My IP address: ");
    Serial.println(WiFi.localIP());
}

// Handle received MQTT messages
void onMqttMessage(int messageSize)
{
    Serial.println("Received MQTT message:");
    String incoming = "";
    while (mqttClient.available())
    {
        incoming += (char)mqttClient.read();
    }

    int result = incoming.toInt();
    if (result > 0)
    {
        analogWrite(LED_BUILTIN, result);
    }

    Serial.println(result);
}

// MQTT Connection
boolean connectToBroker()
{
    // Set username and password for HiveMQ Cloud
    mqttClient.setUsernamePassword(mqttUsername, mqttPassword);

    if (!mqttClient.connect(broker, port))
    {
        Serial.print("MQTT connection failed. Error: ");
        Serial.println(mqttClient.connectError());
        return false;
    }

    Serial.println("Connected to HiveMQ Cloud MQTT broker");
    mqttClient.onMessage(onMqttMessage);
    mqttClient.subscribe(topicTDS);
    mqttClient.subscribe(topicTurbidity);
    mqttClient.subscribe(topicPH);
    mqttClient.subscribe(topicTemperature);
    mqttClient.subscribe(topicStatus);
    return true;
}

// Publish MQTT Data
void publishData(const char *topic, float value)
{
    mqttClient.beginMessage(topic);
    mqttClient.print(value, 2); // 发送两位小数
    mqttClient.endMessage();

    Serial.print("Published: ");
    Serial.print(topic);
    Serial.print(" -> ");
    Serial.println(value, 2);
}

void publishData(const char *topic, String value)
{
    mqttClient.beginMessage(topic);
    mqttClient.print(value); // 直接发送字符串
    mqttClient.endMessage();

    Serial.print("Published: ");
    Serial.print(topic);
    Serial.print(" -> ");
    Serial.println(value);
}

// Median Filtering (TDS Sensor)
int getMedianNum(int bArray[], int iFilterLen)
{
    int bTab[iFilterLen];
    for (byte i = 0; i < iFilterLen; i++)
        bTab[i] = bArray[i];

    for (int j = 0; j < iFilterLen - 1; j++)
    {
        for (int i = 0; i < iFilterLen - j - 1; i++)
        {
            if (bTab[i] > bTab[i + 1])
            {
                int temp = bTab[i];
                bTab[i] = bTab[i + 1];
                bTab[i + 1] = temp;
            }
        }
    }

    return (iFilterLen & 1) ? bTab[(iFilterLen - 1) / 2] : (bTab[iFilterLen / 2] + bTab[iFilterLen / 2 - 1]) / 2;
}

// pH Sensor Noise Reduction
double avergeArray(int *arr, int number)
{
    long amount = 0;
    for (int i = 0; i < number; i++)
        amount += arr[i];
    return (double)amount / number;
}

// Check coconut water status
int checkCoconutStatus(float temp, float tds, float ntu, float ph)
{
    if (!baselineCalculated)
        return 3; // 3 = 初始化中

    float tdsChange = abs(tds - baselineTDS);
    float ntuChange = abs(ntu - baselineNTU);
    float phChange = abs(ph - baselinePH);
    float tempChange = abs(temp - baselineTemp);

    Serial.print("TDS Change: ");
    Serial.print(tdsChange);
    Serial.print("; NTU Change: ");
    Serial.print(ntuChange);
    Serial.print("; pH Change: ");
    Serial.print(phChange);
    Serial.print("; Temp Change: ");
    Serial.println(tempChange);

    // **使用合理的变化范围**
    if (tdsChange < 20 && ntuChange < 5 && phChange < 0.2 && tempChange < 2)
    {
        return 0; // GOOD
    }
    else if (tdsChange < 50 && ntuChange < 15 && phChange < 0.3 && tempChange < 5)
    {
        return 1; // ALERT
    }
    else
    {
        return 2; // BAD
    }
}

// Update LED indicators
void updateLED(int status)
{
    digitalWrite(greenLED, status == 0 ? HIGH : LOW);
    digitalWrite(yellowLED, status == 1 ? HIGH : LOW);
    digitalWrite(redLED, status == 2 ? HIGH : LOW);
}

// Start baseline calculation
void startBaselineCalculation()
{
    if (!baselineInProgress)
    {
        Serial.println("Starting baseline calculation...");
        baselineInProgress = true;
        baselineSampleCount = 0;
        sumTDS = sumNTU = sumPH = sumTemp = 0;
    }
}

// Process baseline sampling
void processBaselineSampling()
{
    static unsigned long lastSampleTime = 0;

    // 每秒采样一次
    if (millis() - lastSampleTime > 1000)
    {
        lastSampleTime = millis();

        // 读取传感器值
        float tds = readTDS();
        float ntu = getTurbidityNTU();
        float ph = readPH();
        float temp = readTemperature();

        // 存储数据到数组
        if (baselineSampleCount < BASELINE_SAMPLES)
        {
            tdsSamples[baselineSampleCount] = tds;
            ntuSamples[baselineSampleCount] = ntu;
            phSamples[baselineSampleCount] = ph;
            tempSamples[baselineSampleCount] = temp;
        }

        // 累加计算均值
        sumTDS += tds;
        sumNTU += ntu;
        sumPH += ph;
        sumTemp += temp;

        // 累加平方值（用于计算方差）
        sumTDS2 += tds * tds;
        sumNTU2 += ntu * ntu;
        sumPH2 += ph * ph;
        sumTemp2 += temp * temp;

        baselineSampleCount++;

        // **当样本数足够时，计算基准值**
        if (baselineSampleCount >= BASELINE_SAMPLES)
        {
            calculateFinalBaseline();
        }
    }
}

void calculateFinalBaseline()
{
    // 计算均值
    baselineTDS = sumTDS / BASELINE_SAMPLES;
    baselineNTU = sumNTU / BASELINE_SAMPLES;
    baselinePH = sumPH / BASELINE_SAMPLES;
    baselineTemp = sumTemp / BASELINE_SAMPLES;

    // 计算方差
    float varianceTDS = (sumTDS2 / BASELINE_SAMPLES) - (baselineTDS * baselineTDS);
    float varianceNTU = (sumNTU2 / BASELINE_SAMPLES) - (baselineNTU * baselineNTU);
    float variancePH = (sumPH2 / BASELINE_SAMPLES) - (baselinePH * baselinePH);
    float varianceTemp = (sumTemp2 / BASELINE_SAMPLES) - (baselineTemp * baselineTemp);

    // **防止 sqrt() 计算 NaN**
    stdTDS = (varianceTDS >= 0) ? sqrt(varianceTDS) : 0;
    stdNTU = (varianceNTU >= 0) ? sqrt(varianceNTU) : 0;
    stdPH = (variancePH >= 0) ? sqrt(variancePH) : 0;
    stdTemp = (varianceTemp >= 0) ? sqrt(varianceTemp) : 0;

    // **加入滑动平均，防止数据跳动**
    const float SMOOTHING_FACTOR = 5.0; // 平滑因子
    baselineTDS = (baselineTDS * (SMOOTHING_FACTOR - 1) + sumTDS / BASELINE_SAMPLES) / SMOOTHING_FACTOR;
    baselineNTU = (baselineNTU * (SMOOTHING_FACTOR - 1) + sumNTU / BASELINE_SAMPLES) / SMOOTHING_FACTOR;
    baselinePH = (baselinePH * (SMOOTHING_FACTOR - 1) + sumPH / BASELINE_SAMPLES) / SMOOTHING_FACTOR;
    baselineTemp = (baselineTemp * (SMOOTHING_FACTOR - 1) + sumTemp / BASELINE_SAMPLES) / SMOOTHING_FACTOR;

    // **打印调试信息**
    Serial.print("Baseline TDS: ");
    Serial.print(baselineTDS, 3);
    Serial.print("; NTU: ");
    Serial.print(baselineNTU, 3);
    Serial.print("; pH: ");
    Serial.print(baselinePH, 3);
    Serial.print("; Temp: ");
    Serial.println(baselineTemp, 3);

    Serial.print("Std TDS: ");
    Serial.print(stdTDS, 3);
    Serial.print("; NTU: ");
    Serial.print(stdNTU, 3);
    Serial.print("; pH: ");
    Serial.print(stdPH, 3);
    Serial.print("; Temp: ");
    Serial.println(stdTemp, 3);

    // **检查数据稳定性**
    float maxDeviation = max(max(stdTDS, stdNTU), max(stdPH, stdTemp));
    if (maxDeviation > ALLOWED_VARIANCE)
    {
        Serial.println("Baseline fluctuation too high, recalculating…");
        baselineSampleCount = 0;
        sumTDS = sumNTU = sumPH = sumTemp = 0;
        sumTDS2 = sumNTU2 = sumPH2 = sumTemp2 = 0;
        return;
    }

    baselineCalculated = true;
    baselineInProgress = false;

    delay(3000);
}

float readTDS()
{
    float sum = 0;
    for (int i = 0; i < SCOUNT; i++)
    {
        sum += analogRead(TdsSensorPin);
    }
    return sum / SCOUNT;
}

// Read Turbidity Sensor
float getTurbidityNTU()
{
    int sensorValue = analogRead(TURBIDITY_PIN);
    float voltage = sensorValue * (5.0 / 1023.0);
    float NTU = (3.0 - voltage) * 1000;
    return (NTU < 0) ? 0 : NTU;
}

// Read pH Sensor
float readPH()
{
    pHArray[pHArrayIndex++] = analogRead(pHSensorPin);
    if (pHArrayIndex == ArrayLength)
        pHArrayIndex = 0;

    voltage = avergeArray(pHArray, ArrayLength) * 5.0 / 1024;
    return (3.5 * voltage + Offset);
}

// Read Temperature Sensor
float readTemperature()
{
    sensors.requestTemperatures();
    return sensors.getTempCByIndex(0);
}

// Determine water status based on sensor values
int determineStatus(float temp, float ppm, float ntu, float ph)
{
    // Convert to correct types for comparison
    bool alert = (temp > 10) || (ppm > 1000) || (ntu > 50) || (ph < 4.4 || ph > 6.0);
    bool risk = (!alert) && ((temp >= 4 && temp <= 10) || (ppm >= 600 && ppm <= 1000) ||
                             (ntu >= 10 && ntu <= 50) || (ph >= 4.4 && ph <= 4.8) || (ph >= 5.4 && ph <= 6.0));

    if (alert)
        return 2; // Red - Alert
    if (risk)
        return 1; // Yellow - Risk
    return 0;     // Green - Safe
}

void setup()
{
    Serial.begin(115200);
    Serial.println("Booting up...");
    sensors.begin();
    warmupStartTime = millis();
    warmupComplete = false;

    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
    {
        Serial.println(F("SSD1306 allocation failed"));
        for (;;)
            ; // 无限循环，防止继续执行
    }

    display.clearDisplay();
    display.display();
    updateOLEDStatus("Preparing");

    pinMode(TdsSensorPin, INPUT);
    pinMode(TURBIDITY_PIN, INPUT);
    pinMode(pHSensorPin, INPUT);
    pinMode(LED_BUILTIN, OUTPUT);

    // Set LED pins as outputs
    pinMode(greenLED, OUTPUT);
    pinMode(yellowLED, OUTPUT);
    pinMode(redLED, OUTPUT);

    connectToNetwork();

    // Generate unique Client ID (important for MQTT connections)
    byte mac[6];
    WiFi.macAddress(mac);
    clientID = "Arduino-"; // Prefix for better identification
    for (int i = 0; i < 6; i++)
    {
        clientID += String(mac[i], HEX);
    }
    mqttClient.setId(clientID);

    Serial.println("Waiting for sensors to stabilize...");

    Serial.println("Setup complete");
}

void loop()
{
    // 第一阶段：Warmup**
    unsigned long elapsedTime = millis() - warmupStartTime;
    int secondsLeft = (20000 - elapsedTime) / 1000;

    // **立即开始读取传感器数据**
    tdsValue = readTDS();
    ntuValue = getTurbidityNTU();
    pHValue = readPH();
    tempValue = readTemperature();

    // **输出到 Serial Monitor**
    Serial.print("{\"tds\":");
    Serial.print(tdsValue, 0);
    Serial.print(",\"ntu\":");
    Serial.print(ntuValue);
    Serial.print(",\"ph\":");
    Serial.print(pHValue, 2);
    Serial.print(",\"temp\":");
    Serial.print(tempValue);
    // Add status to the serial output JSON
    Serial.print(",\"status\":\"");
    Serial.print(currentStatus);
    Serial.println("\"}");

    // **5 秒 Warmup**
    if (elapsedTime < 5000)
    {
        Serial.print("Warmup time left: ");
        Serial.print(secondsLeft);
        Serial.println("s");
        delay(1000);
        return;
    }

    // **Warmup 结束，开始基准计算**
    if (!warmupComplete)
    {
        warmupComplete = true;
        startBaselineCalculation();
    }

    // 🌡 **第二阶段：5分钟计算基准值**
    if (baselineInProgress)
    {
        Serial.print("Baseline samples: ");
        Serial.print(baselineSampleCount);
        Serial.print("/");
        Serial.println(BASELINE_SAMPLES);

        processBaselineSampling(); // **每秒采样**
        delay(1000);
        return;
    }
    // Ensure WiFi connection
    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("WiFi disconnected. Reconnecting...");
        connectToNetwork();
        return;
    }

    // Ensure MQTT connection
    if (!mqttClient.connected())
    {
        Serial.println("Attempting to connect to broker...");
        connectToBroker();
    }

    mqttClient.poll();

    // Read & Calculate TDS every 5 seconds
    static unsigned long lastTdsUpdate = millis();
    if (millis() - lastTdsUpdate > 5000U)
    {
        lastTdsUpdate = millis();
        tdsValue = readTDS();
        Serial.print("TDS Value: ");
        Serial.print(tdsValue, 0);
        Serial.println(" ppm");
    }

    // Read & Calculate Turbidity every 5 seconds
    static unsigned long turbidityTimepoint = millis();
    if (millis() - turbidityTimepoint > 5000U)
    {
        turbidityTimepoint = millis();
        ntuValue = getTurbidityNTU();
        Serial.print("Turbidity: ");
        Serial.print(ntuValue);
        Serial.println(" NTU");
    }

    // Read & Calculate pH every 5 seconds
    static unsigned long pHTimepoint = millis();
    if (millis() - pHTimepoint > 5000U)
    {
        pHTimepoint = millis();
        pHValue = readPH();
        Serial.print("pH Value: ");
        Serial.println(pHValue, 2);
    }

    // Read & Calculate Temperature every 5 seconds
    static unsigned long temperatureTimepoint = millis();
    if (millis() - temperatureTimepoint > 5000U)
    {
        temperatureTimepoint = millis();
        tempValue = readTemperature();

        if (tempValue != -127.00)
        { // If reading is successful
            Serial.print("Temperature: ");
            Serial.print(tempValue);
            Serial.println(" °C");
        }
    }
    // Publish sensor data every 60 seconds
    if (millis() - lastTimeSent > interval)
    {
        if (mqttClient.connected())
        {
            publishData(topicTDS, tdsValue);
            publishData(topicTurbidity, ntuValue);
            publishData(topicPH, pHValue);
            publishData(topicTemperature, tempValue);
            // publishData(topicStatus, currentStatus);
            lastTimeSent = millis();
        }
        if (baselineInProgress)
        {
            Serial.print("Baseline samples: ");
            Serial.print(baselineSampleCount);
            Serial.print("/");
            Serial.println(BASELINE_SAMPLES);
        }
    }

    if (baselineInProgress || !baselineCalculated || !warmupComplete)
    {
        updateOLEDStatus("Preparing"); // **一直显示 "Preparing"**
    }
    else
    {
        int status = checkCoconutStatus(tempValue, tdsValue, ntuValue, pHValue);

        // 设置状态字符串
        if (status == 0)
        {
            currentStatus = "GOOD";
        }
        else if (status == 1)
        {
            currentStatus = "ALERT";
        }
        else
        {
            currentStatus = "BAD";
        }

        Serial.print("Status: ");
        Serial.println(currentStatus);
        Serial.println("------------------------------------------------------------------------------------------");

        if (millis() - lastStatusSent >= interval)
        {
            if (mqttClient.connected())
            {
                publishData(topicStatus, currentStatus);
                lastStatusSent = millis(); // 更新 `lastStatusSent`
            }
        }

        updateLED(status);
        updateOLEDStatus(currentStatus);
    }
    delay(1000); // 避免刷屏太快
}