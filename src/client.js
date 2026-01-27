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
      // userName: 'admin',
      // password: 'securepassword?',
      // type: 1, // UserName
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

    // step 4 : read variables with readVariableValue
    console.log('=== Example read ===');

    const productionLineValue = await session.read({
      nodeId: 'ns=1;s=production_line_running',
      attributeId: AttributeIds.Value,
    });

    console.log(
      'Read variable "ns=1;s=production_line_running" ->',
      productionLineValue.value.value,
    );

    const productionLineStatusValue = await session.read({
      nodeId: 'ns=1;s=production_line_status',
      attributeId: AttributeIds.Value,
    });

    console.log(
      'Read variable "ns=1;s=production_line_status" ->',
      productionLineStatusValue.value.value,
      '\n',
    );

    // Example 3: Write to iPhone product inspections variable
    console.log('\n=== Example write ===');
    console.log('=== Writing to iPhone product inspections variable ===');

    const inspectionsNodeId = 'ns=1;s=iphone_product_inspections';

    // Read current value
    const currentInspections = await session.read({
      nodeId: inspectionsNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Current iPhone product inspections: ${currentInspections.value.value}`);

    // Write new value
    const newInspections = Math.floor(Math.random() * 100000);

    const writeInspectionsResult = await session.write({
      nodeId: inspectionsNodeId,
      attributeId: AttributeIds.Value,
      value: {
        value: {
          dataType: DataType.Int32,
          value: newInspections,
        },
      },
    });

    console.log(
      `Writing new inspection count ${newInspections} with result: ${writeInspectionsResult.toString()}`,
    );

    // Read back to verify
    const updatedInspections = await session.read({
      nodeId: inspectionsNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Reading back the inspection count to verify the write`);
    console.log(`Updated iPhone product inspections: ${updatedInspections.value.value}\n`);

    // Example: Write to iPhone defect name variable
    console.log('=== Writing to iPhone defect name variable ===');

    const defectNameNodeId = 'ns=1;s=iphone_defect_name';

    // Read current value
    const currentDefectName = await session.read({
      nodeId: defectNameNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Current iPhone defect name: ${currentDefectName.value.value}`);

    // Write new value
    const defectNames = [
      'Screen Burn',
      'Battery Failure',
      'Camera Malfunction',
      'Button Defect',
      'Water Damage',
    ];
    const newDefectName = defectNames[Math.floor(Math.random() * defectNames.length)];

    const writeDefectNameResult = await session.write({
      nodeId: defectNameNodeId,
      attributeId: AttributeIds.Value,
      value: {
        value: {
          dataType: DataType.String,
          value: newDefectName,
        },
      },
    });

    console.log(
      `Writing new defect name "${newDefectName}" with result: ${writeDefectNameResult.toString()}`,
    );

    // Read back to verify
    const updatedDefectName = await session.read({
      nodeId: defectNameNodeId,
      attributeId: AttributeIds.Value,
    });

    console.log(`Reading back the defect name to verify the write`);
    console.log(`Updated iPhone defect name: ${updatedDefectName.value.value}\n`);

    // Example: Call the sound_the_alarm method
    console.log('\n=== Example method call ===');
    console.log('=== Calling the SoundTheAlarm method ===');

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
      const methodNodeId = 'ns=1;s=sound_the_alarm';
      const alarmMessage = 'Production line 3: Quality check failure detected';

      console.log(`Calling method: ${methodNodeId} with alarm message: "${alarmMessage}"`);

      try {
        const methodResult = await session.call({
          objectId: deviceNodeId,
          methodId: methodNodeId,
          inputArguments: [
            {
              dataType: DataType.String,
              value: alarmMessage,
            },
          ],
        });

        if (methodResult.statusCode.isGood()) {
          const outputMessage = methodResult.outputArguments[0].value;
          console.log(`Method call successful!`);
          console.log(`Alarm message: "${alarmMessage}"`);
          console.log(`Alarm status: "${outputMessage}"`);
        } else {
          console.log(`Method call failed with status: ${methodResult.statusCode.toString()}`);
        }
      } catch (error) {
        console.log(`Error calling method: ${error.message}`);
      }
    }

    console.log(
      '\n=== Test subscription that will log the changes to the production_line_status variable ===',
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
        nodeId: 'ns=1;s=production_line_status',
        attributeId: AttributeIds.Value,
      },
      parameters,
      TimestampsToReturn.Both,
    );

    monitoredItem.on('changed', (dataValue) => {
      console.log('production_line_status changed ->', dataValue.value.toString());
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
