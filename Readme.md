## Node OPC Server

### Instructions

    - run `npm run docker:build` to build the docker image
    - run `npm run docker:run` to run the image
    - the server will be exposed on port `4334`
    - test connection on: `opc.tcp://0.0.0.0:4334/UA/MyOPCServer`
    - credentials: `admin / securepassword`

### Exposed variables

    - node id: `ns=1;s=hello_world` -> A string value that updates each second
