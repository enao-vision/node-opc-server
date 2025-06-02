import {
  AttributeIds,
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

// const endpointUrl = 'opc.tcp://6.tcp.eu.ngrok.io:11853/UA/MyOPCServer';
const endpointUrl = 'opc.tcp://0.0.0.0:4334/UA/MyOPCServer';

async function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    // step 1 : connect to
    await client.connect(endpointUrl);

    console.log('connected !');

    // step 2 : createSession
    const session = await client.createSession({
      userName: 'admin',
      password: 'securepassword',
      type: 1, // UserName
    });
    console.log('session created !');

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

    console.log('references of RootFolder :');

    for (const reference of browseResult.references) {
      console.log('   -> ', reference.browseName.toString());
    }

    // step 4 : read a variable with readVariableValue
    const helloWorldValue = await session.read({
      nodeId: 'ns=1;s=hello_world',
      attributeId: AttributeIds.Value,
    });

    console.log('ns=1;s=hello_world ->', helloWorldValue.toString());
    //  find method id with browseName 'Name'

    // const methodId = await findMethodId(session, 'ns=1;s=name', 'Name');

    // console.log('methodId ->', methodId);

    // const method = await session.call({
    //   nodeId: methodId,
    //   inputArguments: ['John'],
    // });

    // console.log('method ->', method.outputArguments[0].value);

    // step 5: install a subscription and install a monitored item for 10 seconds
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
        console.log('subscription started - subscriptionId=', subscription.subscriptionId);
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
