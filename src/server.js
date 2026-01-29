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

// const userManager = {
//   isValidUser: function (userName, password) {
//     if (userName === 'admin' && password === 'securepassword') {
//       return true;
//     }

//     return false;
//   },
// };

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
  // Session timeout to prevent stale session buildup (causes latency increase)
  defaultSecureTokenLifetime: 3600000, // 1 hour in milliseconds
  maxAllowedSessionNumber: 100, // Limit concurrent sessions
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
  const receiveTime = Date.now(); // UTC milliseconds since epoch
  const inputValue = inputArguments[0].value;
  
  // Try to extract client timestamp and message from JSON payload
  let alarmMessage = inputValue;
  let clientTimestamp = null;
  let payloadLatency = null;
  
  try {
    // Check if the message is JSON with timestamp
    if (typeof inputValue === 'string' && inputValue.startsWith('{')) {
      const parsed = JSON.parse(inputValue);
      if (parsed.timestamp) {
        // Parse timestamp string respecting its timezone
        const parsedDate = new Date(parsed.timestamp);
        clientTimestamp = parsedDate.getTime();
        
        // Compare timestamps (both in UTC milliseconds, timezone-agnostic)
        if (!isNaN(clientTimestamp)) {
          payloadLatency = receiveTime - clientTimestamp;
        }
      }
      alarmMessage = parsed.message || inputValue; // Use message field if available
    }
  } catch (e) {
    // Not JSON or parse error, use original value
    alarmMessage = inputValue;
  }

  // Return immediately for low latency
  const timestamp = new Date().toISOString();
  const callMethodResult = {
    statusCode: StatusCodes.Good,
    outputArguments: [
      {
        dataType: DataType.String,
        arrayType: VariantArrayType.Scalar, // Scalar, not Array
        value: `ALARM ACTIVATED: "${alarmMessage}" | Time: ${timestamp} | Status: ACKNOWLEDGED`,
      },
    ],
  };

  callback(null, callMethodResult);

  // Move logging to async (non-blocking) to not delay response
  // Only queue if queue isn't too full (prevent latency buildup)
  if (asyncQueueSize < MAX_ASYNC_QUEUE_SIZE) {
    asyncQueueSize++;
    setImmediate(() => {
      asyncQueueSize--;
      const receiveTimeISO = new Date(receiveTime).toISOString();
      console.log(`\n[PAYLOAD RECEIVED] Method Call: SoundTheAlarm`);
      console.log(`  Receive Time: ${receiveTimeISO} (${receiveTime} ms since epoch)`);
      if (clientTimestamp !== null) {
        console.log(`  Client Send Time: ${new Date(clientTimestamp).toISOString()} (${clientTimestamp} ms since epoch)`);
      }
      console.log(`  Alarm Message: ${alarmMessage}`);
      if (payloadLatency !== null && payloadLatency >= 0) {
        console.log(`  Payload Latency: ${payloadLatency.toFixed(2)} ms (from client send to server receive)`);
      } else {
        console.log(`  Payload Latency: N/A (no valid client timestamp in payload)`);
      }
    });
  } else {
    droppedOperations++;
    // Log dropped operations periodically to avoid spam
    if (droppedOperations % 100 === 1) {
      setImmediate(() => {
        console.log(`⚠️ Warning: ${droppedOperations} async operations dropped due to queue full (preventing latency buildup)`);
      });
    }
  }
});

// iPhone product inspections (writable string variable - accepts JSON)
let iphoneProductInspections = '{}';

// Track async operation queue to prevent buildup
let asyncQueueSize = 0;
const MAX_ASYNC_QUEUE_SIZE = 10; // Limit concurrent async operations
let droppedOperations = 0;

namespace.addVariable({
  componentOf: device,
  browseName: 'iPhoneProductInspections',
  nodeId: 'ns=1;s=iphone_product_inspections',
  dataType: 'String',
  minimumSamplingInterval: 100,
  value: {
    get: () => new Variant({ dataType: DataType.String, value: iphoneProductInspections }),
    set: (variant) => {
      const receiveTime = Date.now(); // UTC milliseconds since epoch
      const payload = String(variant.value);
      
      // Store payload immediately (limit size to prevent memory buildup)
      const MAX_PAYLOAD_SIZE = 100000; // 100KB limit
      if (payload.length > MAX_PAYLOAD_SIZE) {
        iphoneProductInspections = payload.substring(0, MAX_PAYLOAD_SIZE) + '...[truncated]';
      } else {
        iphoneProductInspections = payload;
      }
      
      // Return immediately for low latency - move all processing to async
      // Only queue if queue isn't too full (prevent latency buildup)
      if (asyncQueueSize < MAX_ASYNC_QUEUE_SIZE) {
        asyncQueueSize++;
        setImmediate(() => {
          asyncQueueSize--;
        // Try to extract client timestamp from JSON payload
        let clientTimestamp = null;
        let payloadLatency = null;
        
        let parsed = null;
        let hasDefects = false;
        let defectCount = 0;
        let defectMessage = '';
        
        try {
          parsed = JSON.parse(payload);
          
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
          
          // Parse timestamp for latency calculation
          if (parsed.timestamp) {
            // Parse timestamp string respecting its timezone
            const parsedDate = new Date(parsed.timestamp);
            clientTimestamp = parsedDate.getTime();
            
            // Compare timestamps (both in UTC milliseconds, timezone-agnostic)
            if (!isNaN(clientTimestamp)) {
              payloadLatency = receiveTime - clientTimestamp;
            }
          }
        } catch (e) {
          // Not JSON or parse error
          defectMessage = `⚠️ WARNING: Could not parse payload as JSON.`;
        }
        
        // Logging (non-blocking, already in async context)
        const receiveTimeISO = new Date(receiveTime).toISOString();
        console.log(`\n[PAYLOAD RECEIVED] Write Operation: iPhoneProductInspections`);
        console.log(`  Receive Time: ${receiveTimeISO} (${receiveTime} ms since epoch)`);
        if (clientTimestamp !== null) {
          console.log(`  Client Send Time: ${new Date(clientTimestamp).toISOString()} (${clientTimestamp} ms since epoch)`);
        }
        console.log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
        if (payloadLatency !== null && payloadLatency >= 0) {
          console.log(`  Payload Latency: ${payloadLatency.toFixed(2)} ms (from client send to server receive)`);
        } else {
          console.log(`  Payload Latency: N/A (no valid timestamp in payload - add "timestamp": "${new Date().toISOString()}" to JSON)`);
        }
        });
      } else {
        droppedOperations++;
        // Log dropped operations periodically to avoid spam
        if (droppedOperations % 100 === 1) {
          setImmediate(() => {
            console.log(`⚠️ Warning: ${droppedOperations} async operations dropped due to queue full (preventing latency buildup)`);
          });
        }
      }
      
      // Return immediately without waiting for processing
      return StatusCodes.Good;
    },
  },
});

server.start(function () {
  console.log('Server is now listening ... ( press CTRL+C to stop)');
  const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log('URL:', endpointUrl);
  
  // Monitor async queue health periodically (every 30 seconds)
  setInterval(() => {
    if (asyncQueueSize > 0 || droppedOperations > 0) {
      console.log(`[Queue Health] Active async operations: ${asyncQueueSize}/${MAX_ASYNC_QUEUE_SIZE}, Dropped: ${droppedOperations}`);
    }
    // Reset dropped counter periodically to prevent overflow
    if (droppedOperations > 10000) {
      droppedOperations = 0;
    }
  }, 30000); // Every 30 seconds
});
