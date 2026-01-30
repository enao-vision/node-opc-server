import {
  DataType,
  OPCUAServer,
  StatusCodes,
  Variant,
  VariantArrayType
} from 'node-opcua';
import { LogLevel, setLogLevel } from 'node-opcua-debug';
// Import onoff GPIO - use createRequire for CommonJS module in ES module context
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Gpio } = require('onoff');

// Set to most verbose level
setLogLevel(LogLevel.Debug);

// Clock synchronization check for Raspberry Pi
// Raspberry Pis don't have hardware RTC and rely on NTP for time sync
let clockSyncStatus = {
  synchronized: false,
  lastChecked: null,
  ntpActive: false,
  systemTime: null
};

/**
 * Checks if the system clock is synchronized with NTP
 * Raspberry Pis need NTP sync since they don't have hardware RTC
 * @returns {Object} Clock synchronization status
 */
function checkClockSynchronization() {
  try {
    // Check using timedatectl (systemd-based systems like Raspberry Pi OS)
    const output = execSync('timedatectl status', { encoding: 'utf8', stdio: 'pipe' });
    
    const synchronized = output.includes('synchronized: yes') || output.includes('System clock synchronized: yes');
    const ntpActive = output.includes('NTP service: active') || output.includes('NTP enabled: yes');
    
    clockSyncStatus = {
      synchronized,
      ntpActive,
      lastChecked: Date.now(),
      systemTime: new Date().toISOString(),
      rawOutput: output
    };
    
    return clockSyncStatus;
  } catch (error) {
    // Fallback: try to check NTP using ntpq or chrony
    try {
      // Try ntpq (older NTP)
      execSync('ntpq -p 2>/dev/null', { stdio: 'ignore' });
      clockSyncStatus = {
        synchronized: true, // Assume synced if ntpq works
        ntpActive: true,
        lastChecked: Date.now(),
        systemTime: new Date().toISOString(),
        note: 'NTP check via ntpq (assumed synchronized)'
      };
      return clockSyncStatus;
    } catch (e) {
      // If we can't check, assume not synchronized and warn
      clockSyncStatus = {
        synchronized: false,
        ntpActive: false,
        lastChecked: Date.now(),
        systemTime: new Date().toISOString(),
        error: 'Could not determine clock sync status'
      };
      return clockSyncStatus;
    }
  }
}

// Check clock synchronization on startup
console.log('\n=== Clock Synchronization Check ===');
const initialClockCheck = checkClockSynchronization();
if (initialClockCheck.synchronized) {
  console.log('✓ System clock is synchronized with NTP');
  console.log(`  System time: ${initialClockCheck.systemTime}`);
} else {
  console.log('⚠️ WARNING: System clock may not be synchronized!');
  console.log('  Raspberry Pis need NTP to maintain accurate time');
  console.log('  This can cause incorrect latency measurements');
  console.log('\n  To fix:');
  console.log('  1. Check NTP service: sudo systemctl status systemd-timesyncd');
  console.log('  2. Enable NTP: sudo timedatectl set-ntp true');
  console.log('  3. Check status: timedatectl status');
  console.log('  4. Force sync: sudo systemctl restart systemd-timesyncd');
}
console.log('=====================================\n');

// Latency measurement with clock skew handling
// Tracks clock offset between server and client devices
let clockOffsetEstimate = null; // Estimated clock offset in milliseconds (server - client)
let latencyMeasurements = []; // Recent measurements for offset estimation
const MAX_MEASUREMENTS = 100; // Keep last N measurements for offset calculation
const PERCENTILE_FOR_OFFSET = 5; // Use 5th percentile for stable offset estimate (less affected by outliers)

/**
 * Measures latency between device and server when receiving a payload
 * Handles unsynchronized clocks by estimating clock offset over time
 * Uses percentile-based approach for stable offset estimation
 * 
 * @param {string|number} clientTimestamp - Timestamp from client payload (ISO string or milliseconds)
 * @returns {Object} Latency measurement result with:
 *   - apparentLatency: Raw time difference (includes clock offset)
 *   - estimatedLatency: Estimated true latency (adjusted for clock offset)
 *   - clockOffset: Estimated clock offset (server - client)
 *   - serverTime: Server receive time (milliseconds since epoch)
 *   - clientTime: Parsed client timestamp (milliseconds since epoch)
 */
function measureLatency(clientTimestamp) {
  const serverTime = Date.now();
  let clientTime = null;
  
  // Parse client timestamp
  if (clientTimestamp) {
    if (typeof clientTimestamp === 'string') {
      const parsed = new Date(clientTimestamp);
      clientTime = parsed.getTime();
    } else if (typeof clientTimestamp === 'number') {
      clientTime = clientTimestamp;
    }
  }
  
  // If we couldn't parse the timestamp, return null
  if (clientTime === null || isNaN(clientTime)) {
    return {
      apparentLatency: null,
      estimatedLatency: null,
      clockOffset: clockOffsetEstimate,
      serverTime: serverTime,
      clientTime: null,
      valid: false
    };
  }
  
  // Calculate apparent latency (raw time difference)
  const apparentLatency = serverTime - clientTime;
  
  // Add measurement to history
  latencyMeasurements.push({
    serverTime,
    clientTime,
    apparentLatency,
    timestamp: Date.now()
  });
  
  // Keep only recent measurements (sliding window)
  if (latencyMeasurements.length > MAX_MEASUREMENTS) {
    latencyMeasurements.shift();
  }
  
  // Estimate clock offset using percentile-based approach
  // This is more stable than using absolute minimum and handles clock drift better
  if (latencyMeasurements.length >= 10) {
    // Use percentile instead of minimum for stability
    // The 5th percentile represents packets with minimal network delay
    const sortedLatencies = [...latencyMeasurements]
      .map(m => m.apparentLatency)
      .sort((a, b) => a - b);
    
    const percentileIndex = Math.floor((PERCENTILE_FOR_OFFSET / 100) * sortedLatencies.length);
    const percentileLatency = sortedLatencies[Math.max(0, percentileIndex)];
    
    // Only update offset if it's significantly different (to prevent drift)
    // Use exponential smoothing for stability
    if (clockOffsetEstimate === null) {
      clockOffsetEstimate = percentileLatency;
    } else {
      // Only update if new estimate is within reasonable range (prevents sudden jumps)
      // Use weighted average: 90% old, 10% new (very slow adaptation)
      const alpha = 0.1; // Learning rate - low for stability
      const newOffset = percentileLatency;
      
      // Only update if change is reasonable (less than 100ms difference)
      // This prevents offset from drifting due to network conditions
      if (Math.abs(newOffset - clockOffsetEstimate) < 100) {
        clockOffsetEstimate = clockOffsetEstimate * (1 - alpha) + newOffset * alpha;
      }
      // If change is too large, it's likely a network spike, not clock drift
    }
  } else if (latencyMeasurements.length >= 3) {
    // With fewer measurements, use minimum but be conservative
    const sortedLatencies = [...latencyMeasurements]
      .map(m => m.apparentLatency)
      .sort((a, b) => a - b);
    const minLatency = sortedLatencies[0];
    
    if (clockOffsetEstimate === null) {
      clockOffsetEstimate = minLatency;
    } else {
      // Very conservative update with few samples
      const alpha = 0.05; // Even slower learning
      clockOffsetEstimate = clockOffsetEstimate * (1 - alpha) + minLatency * alpha;
    }
  } else {
    // With very few measurements, initialize conservatively
    if (clockOffsetEstimate === null) {
      clockOffsetEstimate = apparentLatency;
    }
  }
  
  // Estimate true latency by subtracting clock offset
  // Ensure it's non-negative
  const estimatedLatency = Math.max(0, apparentLatency - (clockOffsetEstimate || 0));
  
  return {
    apparentLatency,
    estimatedLatency,
    clockOffset: clockOffsetEstimate,
    serverTime,
    clientTime,
    valid: true
  };
}

// GPIO Setup for LED (defect indicator)
// Using GPIO pin 18 (physical pin 12) - change if needed
// You can change this to another pin like 17, 27, 22, etc.
const LED_GPIO_PIN = 530; // LED for defects (solid ON when defects detected)
const NO_DEFECTS_LED_PIN = 539; // LED for no defects (blinks when no defects)
let ledPin = null;
let noDefectsLedPin = null;
let noDefectsBlinkInterval = null; // Interval for blinking the "no defects" LED

// Helper function to safely control LED
function setLED(state) {
  if (!ledPin) return false;
  try {
    ledPin.writeSync(state ? 1 : 0);
    return true;
  } catch (error) {
    // If write fails, try to reinitialize the pin
    if (error.code === 'EINVAL') {
      console.log(`  ⚠️ GPIO pin ${LED_GPIO_PIN} may be in use or invalid. Trying to reinitialize...`);
      try {
        if (ledPin) {
          ledPin.unexport();
        }
        ledPin = new Gpio(LED_GPIO_PIN, 'out');
        ledPin.writeSync(state ? 1 : 0);
        return true;
      } catch (retryError) {
        console.log(`  ⚠️ Failed to reinitialize GPIO: ${retryError.message}`);
        ledPin = null;
        return false;
      }
    }
    console.log(`  ⚠️ Error controlling LED: ${error.message}`);
    return false;
  }
}

// Helper function to safely control "no defects" LED
function setNoDefectsLED(state) {
  if (!noDefectsLedPin) return false;
  try {
    noDefectsLedPin.writeSync(state ? 1 : 0);
    return true;
  } catch (error) {
    if (error.code === 'EINVAL') {
      console.log(`  ⚠️ GPIO pin ${NO_DEFECTS_LED_PIN} may be in use or invalid. Trying to reinitialize...`);
      try {
        if (noDefectsLedPin) {
          noDefectsLedPin.unexport();
        }
        noDefectsLedPin = new Gpio(NO_DEFECTS_LED_PIN, 'out');
        noDefectsLedPin.writeSync(state ? 1 : 0);
        return true;
      } catch (retryError) {
        console.log(`  ⚠️ Failed to reinitialize GPIO: ${retryError.message}`);
        noDefectsLedPin = null;
        return false;
      }
    }
    console.log(`  ⚠️ Error controlling no-defects LED: ${error.message}`);
    return false;
  }
}

// Function to start blinking the "no defects" LED
function startNoDefectsBlink() {
  // Stop any existing blink
  stopNoDefectsBlink();
  
  if (!noDefectsLedPin) return false;
  
  let isOn = false;
  noDefectsBlinkInterval = setInterval(() => {
    isOn = !isOn;
    setNoDefectsLED(isOn);
  }, 250); // Blink every 250ms (same as test-gpio.js)
  
  return true;
}

// Function to stop blinking the "no defects" LED
function stopNoDefectsBlink() {
  if (noDefectsBlinkInterval) {
    clearInterval(noDefectsBlinkInterval);
    noDefectsBlinkInterval = null;
  }
  // Turn off the LED when stopping
  setNoDefectsLED(false);
}

// Initialize GPIO with better error handling
try {
  // First, try to unexport the pin if it's already exported (prevents EINVAL errors)
  try {
    execSync(`echo ${LED_GPIO_PIN} > /sys/class/gpio/unexport 2>/dev/null`, { stdio: 'ignore' });
  } catch (e) {
    // Pin might not be exported, that's fine
  }
  
  // Small delay to ensure pin is released
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Try to initialize GPIO pin
  ledPin = new Gpio(LED_GPIO_PIN, 'out');
  // Test write to ensure pin is accessible
  ledPin.writeSync(0);
  console.log(`✓ GPIO LED initialized on pin ${LED_GPIO_PIN} (physical pin ${LED_GPIO_PIN === 18 ? 12 : LED_GPIO_PIN === 4 ? 7 : 'check pinout'})`);
} catch (error) {
  console.log('⚠️ GPIO initialization failed:', error.message);
  console.log('   Possible causes:');
  console.log('   - Not running on Raspberry Pi');
  console.log('   - GPIO pin already in use by another process');
  console.log('   - Insufficient permissions (try running with: sudo)');
  console.log('   - Invalid GPIO pin number');
  console.log(`   To manually fix: sudo sh -c "echo ${LED_GPIO_PIN} > /sys/class/gpio/unexport"`);
  console.log('   LED control will be disabled.');
  ledPin = null;
}

// Initialize second LED for "no defects" indicator
try {
  try {
    execSync(`echo ${NO_DEFECTS_LED_PIN} > /sys/class/gpio/unexport 2>/dev/null`, { stdio: 'ignore' });
  } catch (e) {
    // Pin might not be exported, that's fine
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  noDefectsLedPin = new Gpio(NO_DEFECTS_LED_PIN, 'out');
  noDefectsLedPin.writeSync(0);
  console.log(`✓ GPIO "No Defects" LED initialized on pin ${NO_DEFECTS_LED_PIN}`);
} catch (error) {
  console.log(`⚠️ "No Defects" LED initialization failed: ${error.message}`);
  console.log(`   To manually fix: sudo sh -c "echo ${NO_DEFECTS_LED_PIN} > /sys/class/gpio/unexport"`);
  console.log('   "No Defects" LED control will be disabled.');
  noDefectsLedPin = null;
}


const server = new OPCUAServer({
  hostname: '0.0.0.0',
  port: 4334, // the port of the listening socket of the server
  resourcePath: '/UA/MyOPCServer', // this path will be added to the endpoint resource name
  // userManager: userManager,
  allowAnonymous: true,
  // securityPolicies: [
  //   SecurityPolicy.None,
  //   // SecurityPolicy.Basic128Rsa15,
  //   // SecurityPolicy.Basic256Sha256,
  // ],
  buildInfo: {
    productName: 'OPC Test Server',
    buildNumber: '7658',
    buildDate: new Date(),
  },
  // Network optimizations for low latency
  serverCapabilities: {
    maxSessions: 100,
    maxSubscriptions: 100,
    maxMonitoredItemsPerCall: 1000,
    maxMonitoredItems: 10000,
    maxArrayLength: 100000,
    maxStringLength: 1000000,
    maxByteStringLength: 1000000,
    // Optimize for low latency: smaller chunks = faster transmission
    maxChunkCount: 1, // Use single chunk for small messages (reduces overhead)
    maxMessageSize: 4194304, // 4MB max message size
    operationLimits: {
      maxNodesPerRead: 10000,
      maxNodesPerWrite: 10000,
      maxNodesPerMethodCall: 1000,
      maxNodesPerBrowse: 10000,
      maxNodesPerRegisterNodes: 10000,
      maxNodesPerTranslateBrowsePathsToNodeIds: 10000,
      maxNodesPerNodeManagement: 10000,
      maxMonitoredItemsPerCall: 1000,
    },
  },
});

await server.initialize();

// Configure TCP socket options for low latency after initialization
// Enable TCP_NODELAY (disable Nagle's algorithm) for immediate packet transmission
try {
  const serverEngine = server.engine;
  if (serverEngine && serverEngine.server) {
    // Access the TCP server and configure socket options
    const tcpServer = serverEngine.server;
    if (tcpServer && tcpServer.on) {
      // Set TCP_NODELAY on all new connections for low latency
      tcpServer.on('connection', (socket) => {
        socket.setNoDelay(true); // Disable Nagle's algorithm - send immediately
        socket.setKeepAlive(true, 60000); // Keep connections alive
        // Additional TCP optimizations
        socket.setTimeout(0); // Disable timeout for persistent connections
      });
      console.log('✓ TCP socket optimizations enabled (TCP_NODELAY, keep-alive)');
    }
  }
} catch (error) {
  console.log('⚠️ Could not configure TCP socket options:', error.message);
  console.log('   This is non-critical - server will continue with default settings');
}

const addressSpace = server.engine.addressSpace;
const namespace = addressSpace.getOwnNamespace();

// declare a new object
const device = namespace.addObject({
  organizedBy: addressSpace.rootFolder.objects,
  browseName: 'MyDevice',
  nodeId: 'ns=1;s=MyDevice', // Explicitly set nodeId for easier access
});

// Production line name variable (read-only)
const productionLineNames = [
  'Assembly Line 1',
  'Assembly Line 2',
  'Assembly Line 3',
  'Assembly Line 4',
  'Assembly Line 5',
];
let currentLineIndex = 0;

const productionLineRunning = namespace.addVariable({
  componentOf: device,
  nodeId: 'ns=1;s=production_line_running',
  browseName: 'ProductionLineRunning',
  dataType: 'String',
});

// Production line status variable that updates every second with status and timestamp
const productionLineStatuses = ['RUNNING', 'STOPPED', 'MAINTENANCE', 'IDLE', 'ERROR'];
let currentStatusIndex = 0;

const productionLineStatus = namespace.addVariable({
  componentOf: device,
  nodeId: 'ns=1;s=production_line_status',
  browseName: 'ProductionLineStatus',
  dataType: 'String',
});

// This will update both variables every second
const timerId = setInterval(() => {
  // Update production line name (changes less frequently)
  const lineName = productionLineNames[currentLineIndex];

  // Update production line status with timestamp
  const status = productionLineStatuses[currentStatusIndex];
  const timestamp = new Date().toISOString();
  const statusMessage = `${status} | ${timestamp}`;

  productionLineRunning.setValueFromSource(
    new Variant({
      dataType: DataType.String,
      value: lineName,
    }),
  );

  productionLineStatus.setValueFromSource(
    new Variant({
      dataType: DataType.String,
      value: statusMessage,
    }),
  );

  // Cycle through statuses (changes every second)
  currentStatusIndex = (currentStatusIndex + 1) % productionLineStatuses.length;

  // Cycle through line names (changes every 5 seconds)
  if (currentStatusIndex === 0) {
    currentLineIndex = (currentLineIndex + 1) % productionLineNames.length;
  }
}, 1000);

addressSpace.registerShutdownTask(() => {
  clearInterval(timerId);
  // Cleanup GPIO on shutdown
  stopNoDefectsBlink(); // Stop blinking before cleanup
  if (ledPin) {
    try {
      setLED(false); // Turn off LED
      ledPin.unexport(); // Unexport GPIO pin
      console.log('✓ GPIO LED cleaned up');
    } catch (error) {
      console.log('Error cleaning up GPIO:', error.message);
    }
  }
  if (noDefectsLedPin) {
    try {
      setNoDefectsLED(false); // Turn off LED
      noDefectsLedPin.unexport(); // Unexport GPIO pin
      console.log('✓ "No Defects" GPIO LED cleaned up');
    } catch (error) {
      console.log('Error cleaning up "No Defects" GPIO:', error.message);
    }
  }
});

const method = namespace.addMethod(device, {
  nodeId: 'ns=1;s=sound_the_alarm',
  browseName: 'SoundTheAlarm',

  inputArguments: [
    {
      name: 'alarmMessage',
      description: { text: 'The alarm message to broadcast' },
      dataType: DataType.String,
    },
  ],

  outputArguments: [
    {
      name: 'alarmStatus',
      description: { text: 'The status of the alarm activation' },
      dataType: DataType.String,
      valueRank: -1, // -1 means scalar (single value), not an array
    },
  ],
});

method.bindMethod((inputArguments, context, callback) => {
  const inputValue = inputArguments[0].value;
  
  // Try to extract message and timestamp from JSON payload
  let alarmMessage = inputValue;
  let clientTimestamp = null;
  
  try {
    // Check if the message is JSON
    if (typeof inputValue === 'string' && inputValue.startsWith('{')) {
      const parsed = JSON.parse(inputValue);
      alarmMessage = parsed.message || inputValue; // Use message field if available
      clientTimestamp = parsed.timestamp || null; // Extract timestamp if present
    }
  } catch (e) {
    // Not JSON or parse error, use original value
    alarmMessage = inputValue;
  }

  // Measure latency if timestamp is available
  const latencyResult = clientTimestamp ? measureLatency(clientTimestamp) : null;

  // Process synchronously - complete all operations before responding
  console.log(`\n[PAYLOAD RECEIVED] Method Call: SoundTheAlarm`);
  console.log(`  Alarm Message: ${alarmMessage}`);
  if (latencyResult && latencyResult.valid) {
    console.log(`  Apparent Latency: ${latencyResult.apparentLatency.toFixed(2)} ms (includes clock offset)`);
    console.log(`  Estimated Latency: ${latencyResult.estimatedLatency.toFixed(2)} ms (adjusted for clock offset)`);
    console.log(`  Clock Offset: ${latencyResult.clockOffset !== null ? latencyResult.clockOffset.toFixed(2) : 'N/A'} ms (server - client)`);
  } else {
    console.log(`  Latency: N/A (no valid timestamp in payload)`);
  }
  
  const callMethodResult = {
    statusCode: StatusCodes.Good,
    outputArguments: [
      {
        dataType: DataType.String,
        arrayType: VariantArrayType.Scalar, // Scalar, not Array
        value: `ALARM ACTIVATED: "${alarmMessage}" | Status: ACKNOWLEDGED`,
      },
    ],
  };

  callback(null, callMethodResult);
});

// iPhone product inspections (writable string variable - accepts JSON)
let iphoneProductInspections = '{}';

namespace.addVariable({
  componentOf: device,
  browseName: 'iPhoneProductInspections',
  nodeId: 'ns=1;s=iphone_product_inspections',
  dataType: 'String',
  minimumSamplingInterval: 5, // Reduced from 100ms to 10ms for faster sampling/updates
  value: {
    get: () => new Variant({ dataType: DataType.String, value: iphoneProductInspections }),
    set: (variant) => {
      const payload = String(variant.value);
      
      // Store payload
      iphoneProductInspections = payload;
      
      // Process synchronously - complete all operations before responding
      let parsed = null;
      let hasDefects = false;
      let defectCount = 0;
      let defectMessage = '';
      let clientTimestamp = null;
      
      try {
        parsed = JSON.parse(payload);
        // Extract timestamp if present
        clientTimestamp = parsed.timestamp || null;
        
        // Check for defects
        if (parsed.defects && Array.isArray(parsed.defects)) {
          defectCount = parsed.defects.length;
          hasDefects = defectCount > 0;
          
          if (hasDefects) {
            defectMessage = `⚠️ DEFECTS DETECTED: ${defectCount} defect(s) found in inspection ID ${parsed.inspectionId || 'N/A'}`;
            if (parsed.defects.length > 0) {
              const defectList = parsed.defects.map((d, i) => {
                if (typeof d === 'string') return `${i + 1}. ${d}`;
                if (typeof d === 'object' && d.description) return `${i + 1}. ${d.description}`;
                return `${i + 1}. ${JSON.stringify(d)}`;
              }).join('\n    ');
              defectMessage += `\n    Defects:\n    ${defectList}`;
            }
            // Turn on defects LED and stop blinking no-defects LED
            stopNoDefectsBlink();
            setLED(true);
          } else {
            defectMessage = `✅ NO DEFECTS: All inspections passed. Everything is fine.`;
            // Turn off defects LED and start blinking no-defects LED
            setLED(false);
            startNoDefectsBlink();
          }
        } else if (parsed.defects !== undefined) {
          // Defects field exists but is not an array
          defectMessage = `⚠️ WARNING: Defects field exists but is not an array.`;
          // Turn off defects LED and start blinking no-defects LED (assume no critical defects)
          setLED(false);
          startNoDefectsBlink();
        } else {
          // No defects field - assume everything is fine
          defectMessage = `✅ NO DEFECTS: No defects field found. Everything is fine.`;
          // Turn off defects LED and start blinking no-defects LED
          setLED(false);
          startNoDefectsBlink();
        }
      } catch (e) {
        // Not JSON or parse error
        defectMessage = `⚠️ WARNING: Could not parse payload as JSON.`;
      }
      
      // Measure latency if timestamp is available
      const latencyResult = clientTimestamp ? measureLatency(clientTimestamp) : null;
      
      // Logging (synchronous)
      console.log(`\n[PAYLOAD RECEIVED] Write Operation: iPhoneProductInspections`);
      console.log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
      if (latencyResult && latencyResult.valid) {
        console.log(`  Apparent Latency: ${latencyResult.apparentLatency.toFixed(2)} ms (includes clock offset)`);
        console.log(`  Estimated Latency: ${latencyResult.estimatedLatency.toFixed(2)} ms (adjusted for clock offset)`);
        console.log(`  Clock Offset: ${latencyResult.clockOffset !== null ? latencyResult.clockOffset.toFixed(2) : 'N/A'} ms (server - client)`);
      } else {
        console.log(`  Latency: N/A (no valid timestamp in payload)`);
      }
      
      // Return after all processing is complete (synchronous round trip)
      return StatusCodes.Good;
    },
  },
});

server.start(function () {
  console.log('Server is now listening ... ( press CTRL+C to stop)');
  const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log('URL:', endpointUrl);
});
