# OPC UA Server & Client

An OPC UA (Unified Architecture) server and client implementation using Node.js and the `node-opcua` library. This project demonstrates OPC UA communication patterns including reading variables, writing values, subscribing to data changes, and calling methods.

## Overview

This project consists of two main components:

- **OPC UA Server**: A server that exposes industrial data points (variables) and methods that can be accessed by OPC UA clients
- **OPC UA Client**: A client application that connects to the server, reads/writes variables, and subscribes to data changes

## Server

The OPC UA server (`src/server.js`) provides the following functionality:

### Features

- **Authentication**: Requires username/password authentication (no anonymous access)

  - Username: `admin`
  - Password: `securepassword`

- **Exposed Variables**:

  - `ns=1;s=hello_world` (String): A read-only variable that automatically updates every second with a timestamped message
  - `ns=1;s=Pressure` (Int32): A writable variable representing pressure in hPa with validation (accepts values between 0 and 2000)

- **Methods**:

  - `ns=1;s=name` (Name): A method that accepts a string input and returns a formatted response

- **Server Configuration**:
  - Endpoint: `opc.tcp://0.0.0.0:4334/UA/MyOPCServer`
  - Security Mode: None (for development/testing)
  - Security Policy: None

### Running the Server Locally

To start the OPC UA server:

```bash
npm run server
```

The server will start listening on port `4334` and display the endpoint URL in the console. Press `CTRL+C` to stop the server.

## Client

The OPC UA client (`src/client.js`) demonstrates various OPC UA operations:

### Features

- **Connection & Authentication**: Connects to the server and authenticates using credentials
- **Browse Operations**: Browses the server's address space to discover available nodes
- **Read Operations**: Reads variable values from the server
- **Write Operations**: Writes new values to writable variables (e.g., Pressure)
- **Subscriptions**: Creates a subscription and monitors variable changes in real-time
- **Browse Path Translation**: Translates browse paths to node IDs

### Client Workflow

1. Connects to the OPC UA server endpoint
2. Creates an authenticated session
3. Browses the server's address space
4. Reads the `hello_world` variable
5. Reads the current `Pressure` value
6. Writes a new random `Pressure` value (0-2000)
7. Verifies the write by reading the value back
8. Creates a subscription to monitor `hello_world` changes for 10 seconds
9. Translates a browse path to find a node ID
10. Closes the session and disconnects

### Running the Client Locally

To run the OPC UA client:

```bash
npm run client
```

**Note**: Ensure the server is running before executing the client. The client will connect, perform its operations, and automatically disconnect after approximately 10 seconds.

## Local Development

### Prerequisites

- Node.js (v14 or higher recommended)
- npm

### Installation

Install dependencies:

```bash
npm install
```

### Running Server and Client

1. **Start the server** (in one terminal):

   ```bash
   npm run server
   ```

2. **Run the client** (in another terminal):
   ```bash
   npm run client
   ```

### Development Mode

For development with auto-reload:

```bash
npm run dev
```

## Docker Deployment

### Building the Docker Image

Build the Docker image:

```bash
npm run docker:build
```

### Running the Container

Run the containerized server:

```bash
npm run docker:run
```

The server will be exposed on port `4334` and accessible at:

- Endpoint URL: `opc.tcp://0.0.0.0:4334/UA/MyOPCServer`
- Credentials: `admin / securepassword`

## Exposed Variables Reference

| Node ID              | Data Type | Access     | Description                                     |
| -------------------- | --------- | ---------- | ----------------------------------------------- |
| `ns=1;s=hello_world` | String    | Read-only  | Updates every second with a timestamped message |
| `ns=1;s=Pressure`    | Int32     | Read/Write | Pressure value in hPa (valid range: 0-2000)     |

## Methods Reference

| Node ID       | Browse Name | Input                | Output                      | Description                                        |
| ------------- | ----------- | -------------------- | --------------------------- | -------------------------------------------------- |
| `ns=1;s=name` | Name        | String (name to say) | String (formatted response) | Returns a formatted message with the provided name |

## Project Structure

```
opc-ua-server/
├── src/
│   ├── server.js      # OPC UA server implementation
│   ├── client.js      # OPC UA client implementation
│   ├── server-write.js # Extended server with additional writable variables
│   └── client-write.js # Extended client with additional write examples
├── Dockerfile         # Docker configuration
├── package.json       # Project dependencies and scripts
└── Readme.md          # This file
```

## License

ISC
