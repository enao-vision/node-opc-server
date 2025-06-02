import { DataType, OPCUAServer, StatusCodes, Variant, VariantArrayType } from 'node-opcua';

// const server = new OPCUAServer({});
// await server.start();

// console.log("Server is now listening ... ( press CTRL+C to stop) ");
// await new Promise((resolve) => process.once("SIGINT", resolve));

// await server.shutdown();
// Let's create an instance of OPCUAServer

const userManager = {
  isValidUser: function (userName, password) {
    if (userName === 'admin' && password === 'securepassword') {
      return true;
    }

    return false;
  },
};

const server = new OPCUAServer({
  // hostname: '6.tcp.eu.ngrok.io',
  port: 4334, // the port of the listening socket of the server
  resourcePath: '/UA/MyOPCServer', // this path will be added to the endpoint resource name
  userManager: userManager,
  allowAnonymous: false,
  buildInfo: {
    productName: 'MySampleServer1',
    buildNumber: '7658',
    buildDate: new Date(2025, 6, 1),
  },
});

await server.initialize();

const addressSpace = server.engine.addressSpace;
const namespace = addressSpace.getOwnNamespace();

// declare a new object
const device = namespace.addObject({
  organizedBy: addressSpace.rootFolder.objects,
  browseName: 'MyDevice',
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

// update variable1 every 500 ms
const timerId = setInterval(() => {
  uaVariable1.setValueFromSource(
    new Variant({ dataType: DataType.String, value: `iOS Hello World ${Math.random()}` }),
  );
}, 1000);

addressSpace.registerShutdownTask(() => {
  clearInterval(timerId);
});

const method = namespace.addMethod(device, {
  nodeId: 's=name',
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
      valueRank: 1,
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
        arrayType: VariantArrayType.Array,
        value: `Your name is ${theName}`,
      },
    ],
  };

  callback(null, callMethodResult);
});

server.start(function () {
  console.log('Server is now listening ... ( press CTRL+C to stop)');
  const endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log('URL:', endpointUrl);
});
