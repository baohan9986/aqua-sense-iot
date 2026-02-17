const { spawn } = require('child_process');
const path = require('path');

// Threshold values for valid data
const VALID_RANGES = {
    tds: { min: 0, max: 500 },
    ntu: { min: 0, max: 200 },
    ph: { min: 3, max: 10 },
    temp: { min: 0, max: 40 }
};

/**
 * Determines liquid status based on sensor data (JavaScript implementation)
 * @param {Object} sensorData - Object containing tds, ntu, ph, and temp values
 * @returns {Promise<string>} - Promise resolving to "GOOD", "ALERT", or "BAD"
 */
async function determineStatusWithGPT2(sensorData) {
    // Filter out invalid data
    if (!isValidData(sensorData)) {
        console.log('Invalid sensor data detected, using fallback logic');
        return determineStatusWithFallbackLogic(sensorData);
    }

    // Log the data being analyzed
    console.log(`Analyzing water quality: TDS=${sensorData.tds}ppm, Turbidity=${sensorData.ntu}NTU, pH=${sensorData.ph}, Temp=${sensorData.temp}°C`);

    try {
        // Use rule-based analysis instead of calling Python GPT-2
        return determineStatusWithRules(sensorData);
    } catch (error) {
        console.error('Error in water quality analysis:', error);
        // Use fallback logic in case of errors
        return determineStatusWithFallbackLogic(sensorData);
    }
}

/**
 * Rule-based water quality status determination (replacement for GPT-2)
 * Based on general water quality guidelines
 */
function determineStatusWithRules(sensorData) {
    const { tds, ntu, ph, temp } = sensorData;

    // Count how many metrics are in each category
    let goodCount = 0, alertCount = 0, badCount = 0;

    // TDS evaluation
    if (tds < 80) goodCount++;
    else if (tds >= 80 && tds < 150) alertCount++;
    else badCount++;

    // Turbidity evaluation
    if (ntu < 15) goodCount++;
    else if (ntu >= 15 && ntu < 50) alertCount++;
    else badCount++;

    // pH evaluation (ideal range is 4.8-5.4 for coconut water)
    if (ph >= 4.8 && ph <= 5.4) goodCount++;
    else if ((ph >= 4.4 && ph < 4.8) || (ph > 5.4 && ph <= 6.0)) alertCount++;
    else badCount++;

    // Temperature evaluation
    if (temp < 10) goodCount++;
    else if (temp >= 10 && temp < 15) alertCount++;
    else badCount++;

    // Weighting certain parameters more than others
    if (ntu > 100) badCount += 2;  // Very high turbidity is particularly bad
    if (ph < 4.0 || ph > 6.5) badCount += 2; // Extreme pH is particularly bad

    // Overall status determination
    if (badCount > 0) {
        return 'BAD';
    } else if (alertCount > 1) {
        return 'ALERT';
    } else {
        return 'GOOD';
    }
}

/**
 * Fallback logic to determine status based on sensor readings
 */
function determineStatusWithFallbackLogic(sensorData) {
    // Implement the same logic as in the Arduino code for consistency
    const { tds, ntu, ph, temp } = sensorData;

    // Check if values are within safe ranges
    const isTdsSafe = tds < 80;
    const isNtuSafe = ntu < 15;
    const isPhSafe = ph >= 4.8 && ph <= 5.4;
    const isTempSafe = temp < 10;

    // Check if values are within alert ranges
    const isTdsAlert = tds >= 80 && tds < 150;
    const isNtuAlert = ntu >= 15 && ntu < 50;
    const isPhAlert = (ph >= 4.4 && ph < 4.8) || (ph > 5.4 && ph <= 6.0);
    const isTempAlert = temp >= 10 && temp < 15;

    // Determine status based on combined conditions
    if (isTdsSafe && isNtuSafe && isPhSafe && isTempSafe) {
        return 'GOOD';
    } else if (isTdsAlert || isNtuAlert || isPhAlert || isTempAlert) {
        return 'ALERT';
    } else {
        return 'BAD';
    }
}

/**
 * Validate data is within expected ranges to filter out sensor glitches
 */
function isValidData(sensorData) {
    for (const [key, value] of Object.entries(sensorData)) {
        if (key in VALID_RANGES) {
            const range = VALID_RANGES[key];
            if (value === undefined || isNaN(value) || value < range.min || value > range.max) {
                console.log(`Invalid ${key} value: ${value}`);
                return false;
            }
        }
    }
    return true;
}

module.exports = {
    determineStatusWithGPT2
};
