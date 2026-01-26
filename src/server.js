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

// add some variables
// add a variable named MyVariable1 to the newly created folder "MyDevice"

// emulate variable1 changing every 500 ms

const uaVariable1 = namespace.addVariable({
  componentOf: device,
  nodeId: 's=hello_world', // a string nodeID
  browseName: 'HelloWorld',
  dataType: 'String',
});

// This will update the variable every 500ms to help with multiple test reads from the client
const timerId = setInterval(() => {
  uaVariable1.setValueFromSource(
    new Variant({
      dataType: DataType.String,
      value: `iOS Hello World ${Math.random()}, updated at ${new Date().toISOString()}`,
    }),
  );
}, 1000);

addressSpace.registerShutdownTask(() => {
  clearInterval(timerId);
});

const method = namespace.addMethod(device, {
  nodeId: 'ns=1;s=name',
  browseName: 'Name',

  inputArguments: [
    {
      name: 'nbSayMyName',
      description: { text: 'The name the server should say' },
      dataType: DataType.String,
    },
  ],

  outputArguments: [
    {
      name: 'YourName',
      description: { text: 'The name the server said' },
      dataType: DataType.String,
      valueRank: -1, // -1 means scalar (single value), not an array
    },
  ],
});

method.bindMethod((inputArguments, context, callback) => {
  const theName = inputArguments[0].value;

  console.log('The client requested to say:', theName);

  const callMethodResult = {
    statusCode: StatusCodes.Good,
    outputArguments: [
      {
        dataType: DataType.String,
        arrayType: VariantArrayType.Scalar, // Scalar, not Array
        value: `Your name is ${theName}`,
      },
    ],
  };

  callback(null, callMethodResult);
});

// Example 3: Writable integer variable with validation
let pressure = 1013;

namespace.addVariable({
  componentOf: device,
  browseName: 'Pressure',
  nodeId: 'ns=1;s=Pressure',
  dataType: 'Int32',
  minimumSamplingInterval: 100,
  value: {
    get: () => new Variant({ dataType: DataType.Int32, value: pressure }),
    set: (variant) => {
      const newPressure = parseInt(variant.value);
      if (newPressure >= 0 && newPressure <= 2000) {
        pressure = newPressure;
        console.log(`Pressure set to: ${pressure} hPa`);
        return StatusCodes.Good;
      } else {
        console.log(`Invalid pressure value: ${newPressure} hPa (must be between 0 and 2000)`);
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
