import {
  DataType,
  OPCUAServer,
  StatusCodes,
  Variant,
  VariantArrayType
} from 'node-opcua';
import { LogLevel, setLogLevel } from 'node-opcua-debug';

// Set to most verbose level
setLogLevel(LogLevel.Debug);

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
});

await server.initialize();

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
  // const receiveTime = Date.now(); // UTC milliseconds since epoch
  // const receiveTimeISO = new Date().toISOString();
  const inputValue = inputArguments[0].value;
  
  // Try to extract client timestamp and message from JSON payload
  let alarmMessage = inputValue;
  // let clientTimestamp = null;
  // let payloadLatency = null;
  
  try {
    // Check if the message is JSON with timestamp
    if (typeof inputValue === 'string' && inputValue.startsWith('{')) {
      const parsed = JSON.parse(inputValue);
      // if (parsed.timestamp) {
      //   // Parse timestamp string to UTC milliseconds
      //   const parsedDate = new Date(parsed.timestamp);
      //   clientTimestamp = parsedDate.getTime();
      //   
      //   // Debug: Show what we're comparing
      //   if (isNaN(clientTimestamp)) {
      //     console.log(`  [DEBUG] Failed to parse timestamp: "${parsed.timestamp}"`);
      //   } else {
      //     // Validate timestamp is reasonable (not NaN, and within last hour)
      //     payloadLatency = receiveTime - clientTimestamp;
      //     
      //     // Validate latency is reasonable (should be positive and less than 60 seconds for local network)
      //     if (payloadLatency < 0) {
      //       console.log(`  [WARNING] Negative latency (${payloadLatency.toFixed(2)} ms) - client timestamp is in the future!`);
      //       console.log(`    Client: ${parsed.timestamp} (${clientTimestamp})`);
      //       console.log(`    Server: ${receiveTimeISO} (${receiveTime})`);
      //       payloadLatency = null;
      //     } else if (payloadLatency > 60000) {
      //       console.log(`  [WARNING] Latency too high (${payloadLatency.toFixed(2)} ms = ${(payloadLatency/1000).toFixed(2)}s) - possible timezone issue`);
      //       console.log(`    Client: ${parsed.timestamp} (${clientTimestamp})`);
      //       console.log(`    Server: ${receiveTimeISO} (${receiveTime})`);
      //       payloadLatency = null;
      //     }
      //   }
      // }
      alarmMessage = parsed.message || inputValue; // Use message field if available
    }
  } catch (e) {
    // Not JSON or parse error, use original value
    alarmMessage = inputValue;
  }

  console.log(`\n[PAYLOAD RECEIVED] Method Call: SoundTheAlarm`);
  // console.log(`  Receive Time: ${receiveTimeISO} (${receiveTime} ms since epoch)`);
  // if (clientTimestamp !== null) {
  //   console.log(`  Client Send Time: ${new Date(clientTimestamp).toISOString()} (${clientTimestamp} ms since epoch)`);
  // }
  console.log(`  Alarm Message: ${alarmMessage}`);
  // if (payloadLatency !== null && payloadLatency >= 0) {
  //   console.log(`  Payload Latency: ${payloadLatency.toFixed(2)} ms (from client send to server receive)`);
  // } else {
  //   console.log(`  Payload Latency: N/A (no valid client timestamp in payload)`);
  // }

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
});

// iPhone product inspections (writable string variable - accepts JSON)
let iphoneProductInspections = '{}';

namespace.addVariable({
  componentOf: device,
  browseName: 'iPhoneProductInspections',
  nodeId: 'ns=1;s=iphone_product_inspections',
  dataType: 'String',
  minimumSamplingInterval: 100,
  value: {
    get: () => new Variant({ dataType: DataType.String, value: iphoneProductInspections }),
    set: (variant) => {
      // const receiveTime = Date.now(); // UTC milliseconds since epoch
      // const receiveTimeISO = new Date().toISOString();
      const payload = String(variant.value);
      
      // Try to extract client timestamp from JSON payload
      // let clientTimestamp = null;
      // let payloadLatency = null;
      
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
          } else {
            defectMessage = `✅ NO DEFECTS: All inspections passed. Everything is fine.`;
          }
        } else if (parsed.defects !== undefined) {
          // Defects field exists but is not an array
          defectMessage = `⚠️ WARNING: Defects field exists but is not an array.`;
        } else {
          // No defects field - assume everything is fine
          defectMessage = `✅ NO DEFECTS: No defects field found. Everything is fine.`;
        }
        
        // Parse timestamp for latency calculation
        // if (parsed.timestamp) {
        //   // Parse timestamp string to UTC milliseconds
        //   const parsedDate = new Date(parsed.timestamp);
        //   clientTimestamp = parsedDate.getTime();
        //   
        //   // Debug: Show what we're comparing
        //   if (isNaN(clientTimestamp)) {
        //     console.log(`  [DEBUG] Failed to parse timestamp: "${parsed.timestamp}"`);
        //   } else {
        //     // Validate timestamp is reasonable (not NaN, and within last hour)
        //     payloadLatency = receiveTime - clientTimestamp;
        //     
        //     // Validate latency is reasonable (should be positive and less than 60 seconds for local network)
        //     if (payloadLatency < 0) {
        //       console.log(`  [WARNING] Negative latency (${payloadLatency.toFixed(2)} ms) - client timestamp is in the future!`);
        //       console.log(`    Client: ${parsed.timestamp} (${clientTimestamp})`);
        //       console.log(`    Server: ${receiveTimeISO} (${receiveTime})`);
        //       payloadLatency = null;
        //     } else if (payloadLatency > 60000) {
        //       console.log(`  [WARNING] Latency too high (${payloadLatency.toFixed(2)} ms = ${(payloadLatency/1000).toFixed(2)}s) - possible timezone issue`);
        //       console.log(`    Client: ${parsed.timestamp} (${clientTimestamp})`);
        //       console.log(`    Server: ${receiveTimeISO} (${receiveTime})`);
        //       payloadLatency = null;
        //     }
        //   }
        // }
      } catch (e) {
        // Not JSON or parse error
        defectMessage = `⚠️ WARNING: Could not parse payload as JSON.`;
      }
      
      iphoneProductInspections = payload;
      
      console.log(`\n[PAYLOAD RECEIVED] Write Operation: iPhoneProductInspections`);
      // console.log(`  Receive Time: ${receiveTimeISO} (${receiveTime} ms since epoch)`);
      // if (clientTimestamp !== null) {
      //   console.log(`  Client Send Time: ${new Date(clientTimestamp).toISOString()} (${clientTimestamp} ms since epoch)`);
      // }
      console.log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
      // if (payloadLatency !== null && payloadLatency >= 0) {
      //   console.log(`  Payload Latency: ${payloadLatency.toFixed(2)} ms (from client send to server receive)`);
      // } else {
      //   console.log(`  Payload Latency: N/A (no valid timestamp in payload - add "timestamp": "${new Date().toISOString()}" to JSON)`);
      // }
      
      // Print defect status message
      console.log(`\n${defectMessage}\n`);
      
      return StatusCodes.Good;
    },
  },
});

server.start(function () {
  console.log('Server is now listening ... ( press CTRL+C to stop)');
  const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log('URL:', endpointUrl);
});
