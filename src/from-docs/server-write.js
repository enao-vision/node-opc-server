import { DataType, DataValue, OPCUAServer, StatusCodes, Variant } from 'node-opcua';
import { LogLevel, setLogLevel } from 'node-opcua-debug';

(async () => {
  try {
    setLogLevel(LogLevel.Debug);

    const userManager = {
      isValidUser: function (userName, password) {
        if (userName === 'admin' && password === 'securepassword') {
          return true;
        }

        return false;
      },
    };

    // Create an OPC UA Server instance
    const server = new OPCUAServer({
      hostname: '0.0.0.0',
      port: 4334,
      resourcePath: '/UA/MyWritableServer',
      userManager: userManager,
      allowAnonymous: false,
      // securityPolicies: [
      //   SecurityPolicy.None,
      //   // SecurityPolicy.Basic128Rsa15,
      //   // SecurityPolicy.Basic256Sha256,
      // ],
      buildInfo: {
        productName: 'MyWritableServer',
        buildNumber: '1.0.0',
        buildDate: new Date(),
      },
    });

    // Initialize the server
    await server.initialize();
    console.log('Server initialized');

    // Get the address space and namespace
    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();

    // Create a device object to organize our variables
    const device = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: 'MyDevice',
    });

    // Example 1: Simple writable variable with getter/setter
    let temperature = 25.0;

    namespace.addVariable({
      componentOf: device,
      browseName: 'Temperature',
      nodeId: 'ns=1;s=Temperature',
      dataType: 'Double',
      minimumSamplingInterval: 100,
      value: {
        get: () => new Variant({ dataType: DataType.Double, value: temperature }),
        set: (variant) => {
          const newValue = parseFloat(variant.value);
          if (newValue >= -50 && newValue <= 150) {
            temperature = newValue;
            console.log(`Temperature set to: ${temperature}°C`);
            return StatusCodes.Good;
          } else {
            console.log(`Invalid temperature value: ${newValue}°C (must be between -50 and 150)`);
            return StatusCodes.BadOutOfRange;
          }
        },
      },
    });

    // Example 2: Writable string variable
    let deviceName = 'DefaultDevice';

    namespace.addVariable({
      componentOf: device,
      browseName: 'DeviceName',
      nodeId: 'ns=1;s=DeviceName',
      dataType: 'String',
      minimumSamplingInterval: 100,
      value: {
        get: () => new Variant({ dataType: DataType.String, value: deviceName }),
        set: (variant) => {
          const newName = variant.value.toString();
          if (newName.length > 0 && newName.length <= 50) {
            deviceName = newName;
            console.log(`Device name set to: ${deviceName}`);
            return StatusCodes.Good;
          } else {
            console.log(`Invalid device name: ${newName} (must be 1-50 characters)`);
            return StatusCodes.BadOutOfRange;
          }
        },
      },
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

    // Example 4: Writable boolean variable
    let alarmEnabled = false;

    namespace.addVariable({
      componentOf: device,
      browseName: 'AlarmEnabled',
      nodeId: 'ns=1;s=AlarmEnabled',
      dataType: 'Boolean',
      minimumSamplingInterval: 100,
      value: {
        get: () => new Variant({ dataType: DataType.Boolean, value: alarmEnabled }),
        set: (variant) => {
          alarmEnabled = Boolean(variant.value);
          console.log(`Alarm enabled set to: ${alarmEnabled}`);
          return StatusCodes.Good;
        },
      },
    });

    // Example 5: Writable array variable
    let sensorReadings = [1.0, 2.0, 3.0, 4.0, 5.0];

    namespace.addVariable({
      componentOf: device,
      browseName: 'SensorReadings',
      nodeId: 'ns=1;s=SensorReadings',
      dataType: 'Double',
      valueRank: 1, // 1-dimensional array
      arrayDimensions: [5], // 5 elements
      minimumSamplingInterval: 100,
      value: {
        get: () =>
          new Variant({
            dataType: DataType.Double,
            arrayType: 1, // Array
            value: sensorReadings,
          }),
        set: (variant) => {
          if (variant.arrayType === 1 && Array.isArray(variant.value)) {
            if (variant.value.length === 5) {
              sensorReadings = variant.value.map((v) => parseFloat(v));
              console.log(`Sensor readings set to: [${sensorReadings.join(', ')}]`);
              return StatusCodes.Good;
            } else {
              console.log(`Invalid array length: ${variant.value.length} (must be 5)`);
              return StatusCodes.BadOutOfRange;
            }
          } else {
            console.log('Invalid data type: expected array');
            return StatusCodes.BadTypeMismatch;
          }
        },
      },
    });

    // Example 6: Read-only variable (for comparison)
    let readOnlyCounter = 0;
    setInterval(() => {
      readOnlyCounter++;
    }, 1000);

    namespace.addVariable({
      componentOf: device,
      browseName: 'ReadOnlyCounter',
      nodeId: 'ns=1;s=ReadOnlyCounter',
      dataType: 'UInt32',
      minimumSamplingInterval: 100,
      value: {
        get: () => new Variant({ dataType: DataType.UInt32, value: readOnlyCounter }),
        // No setter = read-only
      },
    });

    // Start the server
    await server.start();
    console.log('Server is now listening... (press CTRL+C to stop)');
    console.log('Server endpoint URL:', server.getEndpointUrl());

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down server...');
      await server.shutdown(1000);
      console.log('Server has shut down');
      process.exit(0);
    });
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
