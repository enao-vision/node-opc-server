import {
  DataType,
  OPCUAServer,
  SecurityPolicy,
  StatusCodes,
  Variant,
  VariantArrayType,
} from 'node-opcua';
import { LogLevel, setLogLevel } from 'node-opcua-debug';

// Set to most verbose level
setLogLevel(LogLevel.Debug);

const userManager = {
  isValidUser: function (userName, password) {
    if (userName === 'admin' && password === 'securepassword') {
      return true;
    }

    return false;
  },
};

const server = new OPCUAServer({
  hostname: '0.0.0.0',
  port: 4334, // the port of the listening socket of the server
  resourcePath: '/UA/MyOPCServer', // this path will be added to the endpoint resource name
  userManager: userManager,
  allowAnonymous: false,
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
const productionLineNames = ['Assembly Line 1', 'Assembly Line 2', 'Assembly Line 3', 'Assembly Line 4', 'Assembly Line 5'];
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
  const alarmMessage = inputArguments[0].value;
  const timestamp = new Date().toISOString();

  console.log(`ALARM TRIGGERED: ${alarmMessage} at ${timestamp}`);

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

// iPhone product inspections counter (writable integer variable with validation)
let iphoneProductInspections = 0;

namespace.addVariable({
  componentOf: device,
  browseName: 'iPhoneProductInspections',
  nodeId: 'ns=1;s=iphone_product_inspections',
  dataType: 'Int32',
  minimumSamplingInterval: 100,
  value: {
    get: () => new Variant({ dataType: DataType.Int32, value: iphoneProductInspections }),
    set: (variant) => {
      const newInspections = parseInt(variant.value);
      if (newInspections >= 0 && newInspections <= 100000) {
        iphoneProductInspections = newInspections;
        console.log(`iPhone product inspections count set to: ${iphoneProductInspections}`);
        return StatusCodes.Good;
      } else {
        console.log(`Invalid inspection count: ${newInspections} (must be between 0 and 100000)`);
        return StatusCodes.BadOutOfRange;
      }
    },
  },
});

server.start(function () {
  console.log('Server is now listening ... ( press CTRL+C to stop)');
  const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log('URL:', endpointUrl);
});
