import { AttributeIds, DataType } from 'node-opcua';
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

// Connect to server running on Raspberry Pi
// Replace <RASPBERRY_PI_IP> with your Raspberry Pi's actual IP address on the WiFi network
// Example: 'opc.tcp://192.168.1.50:4334/UA/MyOPCServer'
const endpointUrl = 'opc.tcp://192.168.101.144:4334/UA/MyOPCServer';

async function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Performance measurement helper
function measureTime(label) {
  const start = process.hrtime.bigint();
  return {
    end: () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
      return duration;
    },
  };
}

async function main() {
  const performanceStats = {
    connectionTime: 0,
    sessionCreationTime: 0,
    readTimes: [],
    writeTimes: [],
    methodCallTime: 0,
    subscriptionLatencies: [],
  };

  try {
    // Measure connection time
    console.log('=== Performance Test: OPC UA Communication Speed ===\n');
    const connectTimer = measureTime('Connection');
    await client.connect(endpointUrl);
    performanceStats.connectionTime = connectTimer.end();

    console.log(`✓ Connected to ${endpointUrl}!`);
    console.log(`  Connection time: ${performanceStats.connectionTime.toFixed(2)} ms\n`);

    // step 2 : createSession
    const sessionTimer = measureTime('Session Creation');
    const session = await client.createSession({
      // userName: 'admin',
      // password: 'securepassword?',
      // type: 1, // UserName
    });
    performanceStats.sessionCreationTime = sessionTimer.end();

    console.log(`✓ Session created!`);
    console.log(`  Session creation time: ${performanceStats.sessionCreationTime.toFixed(2)} ms\n`);

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
    console.log('=== Performance Test: Read Operations ===');

    // Test multiple reads to get average latency
    const readCount = 10;
    console.log(`Performing ${readCount} read operations to measure average latency...\n`);

    for (let i = 0; i < readCount; i++) {
      const readTimer = measureTime('Read');
      const productionLineValue = await session.read({
        nodeId: 'ns=1;s=production_line_running',
        attributeId: AttributeIds.Value,
      });
      const readTime = readTimer.end();
      performanceStats.readTimes.push(readTime);

      if (i === 0) {
        console.log(
          `Read variable "ns=1;s=production_line_running" -> ${productionLineValue.value.value}`,
        );
      }
    }

    const avgReadTime =
      performanceStats.readTimes.reduce((a, b) => a + b, 0) / performanceStats.readTimes.length;
    const minReadTime = Math.min(...performanceStats.readTimes);
    const maxReadTime = Math.max(...performanceStats.readTimes);

    console.log(`\nRead Performance Statistics:`);
    console.log(`  Average: ${avgReadTime.toFixed(2)} ms`);
    console.log(`  Minimum: ${minReadTime.toFixed(2)} ms`);
    console.log(`  Maximum: ${maxReadTime.toFixed(2)} ms`);
    console.log(`  Reads/sec: ${(1000 / avgReadTime).toFixed(1)}\n`);

    // Example 3: Write to iPhone product inspections variable
    console.log('=== Performance Test: Write Operations ===');

    const inspectionsNodeId = 'ns=1;s=iphone_product_inspections';

    // Test multiple writes to get average latency
    const writeCount = 10;
    console.log(`Performing ${writeCount} write operations to measure average latency...\n`);

    for (let i = 0; i < writeCount; i++) {
      // Write new value as JSON (include timestamp for latency measurement)
      const clientSendTime = new Date().toISOString();
      
      // Alternate between inspections with and without defects for testing
      const hasDefects = i % 3 === 0; // Every 3rd inspection has defects
      
      const inspectionData = {
        inspectionId: Math.floor(Math.random() * 10000),
        timestamp: clientSendTime, // Server will use this to calculate payload latency
        status: hasDefects ? 'FAILED' : 'PASSED',
        inspector: 'Quality Control Team A',
        defects: hasDefects
          ? [
              'Scratch on screen',
              'Button misalignment',
              'Camera lens smudge',
            ]
          : [], // Empty array means no defects
      };

      const newInspections = JSON.stringify(inspectionData);

      const writeTimer = measureTime('Write');
      const writeInspectionsResult = await session.write({
        nodeId: inspectionsNodeId,
        attributeId: AttributeIds.Value,
        value: {
          value: {
            dataType: DataType.String,
            value: newInspections,
          },
        },
      });
      const writeTime = writeTimer.end();
      performanceStats.writeTimes.push(writeTime);
    }

    const avgWriteTime =
      performanceStats.writeTimes.reduce((a, b) => a + b, 0) / performanceStats.writeTimes.length;
    const minWriteTime = Math.min(...performanceStats.writeTimes);
    const maxWriteTime = Math.max(...performanceStats.writeTimes);

    console.log(`Write Performance Statistics:`);
    console.log(`  Average: ${avgWriteTime.toFixed(2)} ms`);
    console.log(`  Minimum: ${minWriteTime.toFixed(2)} ms`);
    console.log(`  Maximum: ${maxWriteTime.toFixed(2)} ms`);
    console.log(`  Writes/sec: ${(1000 / avgWriteTime).toFixed(1)}\n`);

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
      const clientSendTime = new Date().toISOString();
      // Include timestamp in message for server-side latency measurement
      const alarmMessageWithTimestamp = JSON.stringify({
        message: 'Production line 3: Quality check failure detected',
        timestamp: clientSendTime,
      });
      const alarmMessage = 'Production line 3: Quality check failure detected';

      console.log('=== Performance Test: Method Call ===');
      console.log(`Calling method: ${methodNodeId} with alarm message: "${alarmMessage}"`);

      try {
        const methodTimer = measureTime('Method Call');
        const methodResult = await session.call({
          objectId: deviceNodeId,
          methodId: methodNodeId,
          inputArguments: [
            {
              dataType: DataType.String,
              value: alarmMessageWithTimestamp, // Send with timestamp for latency measurement
            },
          ],
        });
        performanceStats.methodCallTime = methodTimer.end();

        if (methodResult.statusCode.isGood()) {
          const outputMessage = methodResult.outputArguments[0].value;
          console.log(`✓ Method call successful!`);
          console.log(`  Method call latency: ${performanceStats.methodCallTime.toFixed(2)} ms`);
          console.log(`  Alarm message: "${alarmMessage}"`);
          console.log(`  Alarm status: "${outputMessage}"\n`);
        } else {
          console.log(`Method call failed with status: ${methodResult.statusCode.toString()}\n`);
        }
      } catch (error) {
        console.log(`Error calling method: ${error.message}\n`);
      }
    }

    console.log('=== Performance Test: Subscription Updates ===');
    console.log('Monitoring production_line_status for 5 seconds to measure update latency...\n');
    // install a subscription and install a monitored item for 10 seconds
    // Optimized for high-speed communication: 50ms publishing interval (20 updates/sec)
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval: 50, // 50ms = 20 updates per second
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    });

    let updateCount = 0;
    const subscriptionStartTime = Date.now();

    subscription
      .on('started', function () {
        console.log(`✓ Subscription started - subscriptionId=${subscription.subscriptionId}`);
        console.log('  Waiting for updates...\n');
      })
      .on('keepalive', function () {
        console.log('  [Keepalive]');
      })
      .on('terminated', function () {
        console.log('  [Subscription terminated]');
      });

    const parameters = {
      samplingInterval: 50, // 50ms = 20 samples per second for high-speed communication
      discardOldest: true,
      queueSize: 20, // Increased queue size for faster updates
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
      updateCount++;
      const now = Date.now();
      const serverTime = dataValue.sourceTimestamp ? new Date(dataValue.sourceTimestamp).getTime() : now;
      const latency = now - serverTime;
      
      if (updateCount <= 5) {
        // Show first few updates with latency
        console.log(
          `  Update #${updateCount}: ${dataValue.value.toString()} | Latency: ${latency} ms`,
        );
      }
      
      // Store latency for statistics (if server timestamp is available)
      if (dataValue.sourceTimestamp) {
        performanceStats.subscriptionLatencies.push(latency);
      }
    });

    // step 6: finding the nodeId of a node by Browse name
    const browsePath = makeBrowsePath(
      'RootFolder',
      '/Objects/Server.ServerStatus.BuildInfo.ProductName',
    );

    const result = await session.translateBrowsePath(browsePath);
    const productNameNodeId = result.targets[0].targetId;
    console.log('Product Name nodeId = ', productNameNodeId.toString());

    // Wait 5 seconds to collect subscription update data
    await timeout(5000);

    console.log(`\n  Total updates received: ${updateCount}`);
    if (performanceStats.subscriptionLatencies.length > 0) {
      const avgLatency =
        performanceStats.subscriptionLatencies.reduce((a, b) => a + b, 0) /
        performanceStats.subscriptionLatencies.length;
      const minLatency = Math.min(...performanceStats.subscriptionLatencies);
      const maxLatency = Math.max(...performanceStats.subscriptionLatencies);
      console.log(`  Average update latency: ${avgLatency.toFixed(2)} ms`);
      console.log(`  Minimum latency: ${minLatency.toFixed(2)} ms`);
      console.log(`  Maximum latency: ${maxLatency.toFixed(2)} ms`);
      console.log(`  Updates/sec: ${(updateCount / 5).toFixed(1)}\n`);
    }

    console.log('Terminating subscription...');
    await subscription.terminate();

    // Final Performance Summary
    console.log('\n' + '='.repeat(60));
    console.log('=== FINAL PERFORMANCE SUMMARY ===');
    console.log('='.repeat(60));
    console.log(`Connection Time:        ${performanceStats.connectionTime.toFixed(2)} ms`);
    console.log(`Session Creation:       ${performanceStats.sessionCreationTime.toFixed(2)} ms`);
    
    if (performanceStats.readTimes.length > 0) {
      const avgRead = performanceStats.readTimes.reduce((a, b) => a + b, 0) / performanceStats.readTimes.length;
      console.log(`Average Read Latency:   ${avgRead.toFixed(2)} ms (${(1000 / avgRead).toFixed(1)} reads/sec)`);
    }
    
    if (performanceStats.writeTimes.length > 0) {
      const avgWrite = performanceStats.writeTimes.reduce((a, b) => a + b, 0) / performanceStats.writeTimes.length;
      console.log(`Average Write Latency:  ${avgWrite.toFixed(2)} ms (${(1000 / avgWrite).toFixed(1)} writes/sec)`);
    }
    
    if (performanceStats.methodCallTime > 0) {
      console.log(`Method Call Latency:    ${performanceStats.methodCallTime.toFixed(2)} ms`);
    }
    
    if (performanceStats.subscriptionLatencies.length > 0) {
      const avgSub = performanceStats.subscriptionLatencies.reduce((a, b) => a + b, 0) / performanceStats.subscriptionLatencies.length;
      console.log(`Average Update Latency:  ${avgSub.toFixed(2)} ms`);
      console.log(`Subscription Updates:   ${updateCount} updates in 5 seconds (${(updateCount / 5).toFixed(1)} updates/sec)`);
    }
    
    const totalTime = performanceStats.connectionTime + performanceStats.sessionCreationTime;
    console.log(`\nTotal Setup Time:       ${totalTime.toFixed(2)} ms`);
    console.log('='.repeat(60) + '\n');

    // close session
    await session.close();

    // disconnecting
    await client.disconnect();
    console.log('✓ Performance test completed!');
  } catch (err) {
    console.log('An error has occurred : ', err);
  }
}

main();
