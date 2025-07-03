import { AttributeIds, DataType, OPCUAClient, Variant } from 'node-opcua';

async function main() {
  const client = OPCUAClient.create({});

  try {
    // Connect to the server
    await client.connect('opc.tcp://0.0.0.0:4334/UA/MyWritableServer');
    console.log('Connected to server');

    // Create a session
    const session = await client.createSession();
    console.log('Session created');

    // Example 1: Write to Temperature variable
    console.log('\n=== Writing to Temperature variable ===');
    const temperatureNodeId = 'ns=1;s=Temperature';

    // Read current value
    const currentTemp = await session.read({
      nodeId: temperatureNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Current temperature: ${currentTemp.value.value}°C`);

    // Write new value
    const newTemp = 30.5;
    const writeResult = await session.write({
      nodeId: temperatureNodeId,
      attributeId: AttributeIds.Value,
      value: new Variant({ dataType: DataType.Double, value: newTemp }),
    });
    console.log(`Write result: ${writeResult.toString()}`);

    // Read back to verify
    const updatedTemp = await session.read({
      nodeId: temperatureNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Updated temperature: ${updatedTemp.value.value}°C`);

    // Example 2: Write to DeviceName variable
    console.log('\n=== Writing to DeviceName variable ===');
    const deviceNameNodeId = 'ns=1;s=DeviceName';

    // Read current value
    const currentName = await session.read({
      nodeId: deviceNameNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Current device name: ${currentName.value.value}`);

    // Write new value
    const newName = 'MyCustomDevice';
    const writeNameResult = await session.write({
      nodeId: deviceNameNodeId,
      attributeId: AttributeIds.Value,
      value: new Variant({ dataType: DataType.String, value: newName }),
    });
    console.log(`Write result: ${writeNameResult.toString()}`);

    // Read back to verify
    const updatedName = await session.read({
      nodeId: deviceNameNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Updated device name: ${updatedName.value.value}`);

    // Example 3: Write to Pressure variable
    console.log('\n=== Writing to Pressure variable ===');
    const pressureNodeId = 'ns=1;s=Pressure';

    // Read current value
    const currentPressure = await session.read({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Current pressure: ${currentPressure.value.value} hPa`);

    // Write new value
    const newPressure = 1020;
    const writePressureResult = await session.write({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
      value: new Variant({ dataType: DataType.Int32, value: newPressure }),
    });
    console.log(`Write result: ${writePressureResult.toString()}`);

    // Read back to verify
    const updatedPressure = await session.read({
      nodeId: pressureNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Updated pressure: ${updatedPressure.value.value} hPa`);

    // Example 4: Write to AlarmEnabled variable
    console.log('\n=== Writing to AlarmEnabled variable ===');
    const alarmNodeId = 'ns=1;s=AlarmEnabled';

    // Read current value
    const currentAlarm = await session.read({
      nodeId: alarmNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Current alarm enabled: ${currentAlarm.value.value}`);

    // Write new value
    const newAlarmState = true;
    const writeAlarmResult = await session.write({
      nodeId: alarmNodeId,
      attributeId: AttributeIds.Value,
      value: new Variant({ dataType: DataType.Boolean, value: newAlarmState }),
    });
    console.log(`Write result: ${writeAlarmResult.toString()}`);

    // Read back to verify
    const updatedAlarm = await session.read({
      nodeId: alarmNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Updated alarm enabled: ${updatedAlarm.value.value}`);

    // Example 5: Write to SensorReadings array
    console.log('\n=== Writing to SensorReadings array ===');
    const sensorNodeId = 'ns=1;s=SensorReadings';

    // Read current value
    const currentSensors = await session.read({
      nodeId: sensorNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Current sensor readings: [${currentSensors.value.value.join(', ')}]`);

    // Write new array
    const newSensorReadings = [10.1, 20.2, 30.3, 40.4, 50.5];
    const writeSensorResult = await session.write({
      nodeId: sensorNodeId,
      attributeId: AttributeIds.Value,
      value: new Variant({
        dataType: DataType.Double,
        arrayType: 1, // Array
        value: newSensorReadings,
      }),
    });
    console.log(`Write result: ${writeSensorResult.toString()}`);

    // Read back to verify
    const updatedSensors = await session.read({
      nodeId: sensorNodeId,
      attributeId: AttributeIds.Value,
    });
    console.log(`Updated sensor readings: [${updatedSensors.value.value.join(', ')}]`);

    // Example 6: Try to write to read-only variable (should fail)
    console.log('\n=== Attempting to write to read-only variable ===');
    const readOnlyNodeId = 'ns=1;s=ReadOnlyCounter';

    try {
      const writeReadOnlyResult = await session.write({
        nodeId: readOnlyNodeId,
        attributeId: AttributeIds.Value,
        value: new Variant({ dataType: DataType.UInt32, value: 999 }),
      });
      console.log(`Write result: ${writeReadOnlyResult.toString()}`);
    } catch (error) {
      console.log(`Expected error when writing to read-only variable: ${error.message}`);
    }

    // Example 7: Demonstrate validation (try invalid values)
    console.log('\n=== Testing validation (invalid values) ===');

    // Try invalid temperature (out of range)
    try {
      const invalidTempResult = await session.write({
        nodeId: temperatureNodeId,
        attributeId: AttributeIds.Value,
        value: new Variant({ dataType: DataType.Double, value: 200.0 }), // Too high
      });
      console.log(`Invalid temperature write result: ${invalidTempResult.toString()}`);
    } catch (error) {
      console.log(`Expected error for invalid temperature: ${error.message}`);
    }

    // Try invalid device name (too long)
    try {
      const longName = 'A'.repeat(100); // 100 characters
      const invalidNameResult = await session.write({
        nodeId: deviceNameNodeId,
        attributeId: AttributeIds.Value,
        value: new Variant({ dataType: DataType.String, value: longName }),
      });
      console.log(`Invalid name write result: ${invalidNameResult.toString()}`);
    } catch (error) {
      console.log(`Expected error for invalid device name: ${error.message}`);
    }

    // Close session and disconnect
    await session.close();
    await client.disconnect();
    console.log('\nDisconnected from server');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
