import { AttributeIds, DataType, Variant } from 'node-opcua';
import {
  BrowseDirection,
  ClientMonitoredItem,
  ClientSubscription,
  MessageSecurityMode,
  NodeClassMask,
  OPCUAClient,
  ResultMask,
  SecurityPolicy,
  TimestampsToReturn,
  makeBrowsePath,
} from 'node-opcua-client';

const connectionStrategy = {
  initialDelay: 1000,
  maxRetry: 1,
};

const client = OPCUAClient.create({
  applicationName: 'MyClient',
  connectionStrategy: connectionStrategy,
  securityMode: MessageSecurityMode.None,
  securityPolicy: SecurityPolicy.None,
  endpointMustExist: false,
});

const endpointUrl = 'opc.tcp://0.0.0.0:4334/UA/MyOPCServer';

async function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    await client.connect(endpointUrl);

    console.log(`Connected to ${endpointUrl}!`);

    // step 2 : createSession
    const session = await client.createSession({
      userName: 'admin',
      password: 'securepassword',
      type: 1, // UserName
    });

    console.log(`Session created!\n`);

    // step 3 : browse
    const browseResult = await session.browse({
      nodeId: 'RootFolder',
      referenceTypeId: 'Organizes',
      includeSubtypes: true,
      nodeClassMask: NodeClassMask.Object | NodeClassMask.Variable | NodeClassMask.Method,
      browseDirection: BrowseDirection.Forward,
      resultMask:
        ResultMask.BrowseName |
        ResultMask.DisplayName |
        ResultMask.NodeClass |
        ResultMask.TypeDefinition,
    });

    // step 4 : read a variable with readVariableValue
    const helloWorldValue = await session.read({
      nodeId: 'ns=1;s=hello_world',
      attributeId: AttributeIds.Value,
    });

    console.log('=== Example read ===');
    console.log('Read variable "ns=1;s=hello_world" ->', helloWorldValue.value.value, '\n');
    console.log('hello_world object ->', helloWorldValue.toString(), '\n');

    // Example 3: Write to Pressure variable
    console.log('\n=== Example write ===');
    console.log('=== Writing to Pressure variable ===');

    const pressureNodeId = 'ns=1;s=Pressure';

    // Read current value
    const currentPressure = await session.read({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Current pressure: ${currentPressure.value.value} hPa`);

    // Write new value
    const newPressure = Math.floor(Math.random() * 2000);

    const writePressureResult = await session.write({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
      value: {
        value: {
          dataType: DataType.Int32,
          value: newPressure,
        },
      },
    });

    console.log(
      `Writing new pressure value ${newPressure} with result: ${writePressureResult.toString()}`,
    );

    // Read back to verify
    const updatedPressure = await session.read({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Reading back the pressure to verify the write`);
    console.log(`Updated pressure: ${updatedPressure.value.value} hPa\n`);

    // Example: Call the Name method
    console.log('\n=== Example method call ===');
    console.log('=== Calling the Name method ===');

    // Use the explicit device nodeId, or try to find it via browse path
    let deviceNodeId = 'ns=1;s=MyDevice';
    let deviceFound = true;

    // Try to verify the device exists by reading its node class
    try {
      const deviceInfo = await session.read({
        nodeId: deviceNodeId,
        attributeId: AttributeIds.NodeClass,
      });
      console.log(`Using device object: ${deviceNodeId}`);
    } catch (error) {
      // If direct access fails, try to find it via browse path
      console.log(`Direct nodeId access failed, trying browse path...`);
      const deviceBrowsePath = makeBrowsePath('RootFolder', '/Objects/MyDevice');
      const devicePathResult = await session.translateBrowsePath(deviceBrowsePath);

      if (devicePathResult.targets && devicePathResult.targets.length > 0) {
        deviceNodeId = devicePathResult.targets[0].targetId;
        console.log(`Found device object via browse path: ${deviceNodeId.toString()}`);
      } else {
        deviceFound = false;
        console.log('Could not find device object to call method');
      }
    }

    if (deviceFound) {
      const methodNodeId = 'ns=1;s=name';
      const inputName = 'John Doe';

      console.log(`Calling method: ${methodNodeId} with input: "${inputName}"`);

      try {
        const methodResult = await session.call({
          objectId: deviceNodeId,
          methodId: methodNodeId,
          inputArguments: [
            {
              dataType: DataType.String,
              value: inputName,
            },
          ],
        });

        if (methodResult.statusCode.isGood()) {
          const outputMessage = methodResult.outputArguments[0].value;
          console.log(`Method call successful!`);
          console.log(`Input: "${inputName}"`);
          console.log(`Output: "${outputMessage}"`);
        } else {
          console.log(`Method call failed with status: ${methodResult.statusCode.toString()}`);
        }
      } catch (error) {
        console.log(`Error calling method: ${error.message}`);
      }
    }

    console.log(
      '\n=== Test subscription that will log the changes to the hello_world variable ===',
    );
    // install a subscription and install a monitored item for 10 seconds
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    });

    subscription
      .on('started', function () {
        console.log('Subscription started - subscriptionId=', subscription.subscriptionId);
      })
      .on('keepalive', function () {
        console.log('keepalive');
      })
      .on('terminated', function () {
        console.log('terminated');
      });

    const parameters = {
      samplingInterval: 100,
      discardOldest: true,
      queueSize: 10,
    };

    const monitoredItem = ClientMonitoredItem.create(
      subscription,
      {
        nodeId: 'ns=1;s=hello_world',
        attributeId: AttributeIds.Value,
      },
      parameters,
      TimestampsToReturn.Both,
    );

    monitoredItem.on('changed', (dataValue) => {
      console.log('hello_world changed ->', dataValue.value.toString());
    });

    // step 6: finding the nodeId of a node by Browse name
    const browsePath = makeBrowsePath(
      'RootFolder',
      '/Objects/Server.ServerStatus.BuildInfo.ProductName',
    );

    const result = await session.translateBrowsePath(browsePath);
    const productNameNodeId = result.targets[0].targetId;
    console.log('Product Name nodeId = ', productNameNodeId.toString());

    await timeout(10000);

    console.log('Now terminating subscription');

    await subscription.terminate();

    // close session
    await session.close();

    // disconnecting
    await client.disconnect();
    console.log('done !');
  } catch (err) {
    console.log('An error has occurred : ', err);
  }
}

main();
