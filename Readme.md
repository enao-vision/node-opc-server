# OPC UA Server & Client

An OPC UA (Unified Architecture) server and client implementation using Node.js and the `node-opcua` library. This project demonstrates OPC UA communication patterns including reading variables, writing values, subscribing to data changes, and calling methods.

## Overview

This project consists of two main components:

- **OPC UA Server**: A server that exposes industrial data points (variables) and methods that can be accessed by OPC UA clients
- **OPC UA Client**: A client application that connects to the server, reads/writes variables, and subscribes to data changes

## Server

The OPC UA server (`src/server.js`) provides the following functionality:

### Features

- **Authentication**: Server allows anonymous connections

- **Exposed Variables**:

  - `ns=1;s=production_line_running` (String): A read-only variable that returns the name of the production line (e.g., "Assembly Line 2")
  - `ns=1;s=production_line_status` (String): A read-only variable that automatically updates every second with the production line status (RUNNING, STOPPED, MAINTENANCE, IDLE, ERROR) alongside the current timestamp
  - `ns=1;s=iphone_product_inspections` (Int32): A writable variable representing iPhone product inspection count with validation (accepts values between 0 and 100,000)
  - `ns=1;s=iphone_defect_name` (String): A writable variable representing the iPhone defect name with validation (accepts strings between 1 and 100 characters)

- **Methods**:

  - `ns=1;s=sound_the_alarm` (SoundTheAlarm): A method that accepts an alarm message string input and returns an alarm activation status with timestamp

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

- **Connection**: Connects to the server
- **Browse Operations**: Browses the server's address space to discover available nodes
- **Read Operations**: Reads variable values from the server
- **Write Operations**: Writes new values to writable variables (e.g., iPhone product inspections count and defect name)
- **Method Calls**: Calls server methods (e.g., sound_the_alarm)
- **Subscriptions**: Creates a subscription and monitors variable changes in real-time
- **Browse Path Translation**: Translates browse paths to node IDs

### Client Workflow

1. Connects to the OPC UA server endpoint
2. Creates a session
3. Browses the server's address space
4. Reads the `production_line_running` variable (production line name)
5. Reads the `production_line_status` variable (status with timestamp)
6. Reads the current `iphone_product_inspections` value
7. Writes a new random `iphone_product_inspections` value (0-100,000)
8. Verifies the write by reading the value back
9. Reads the current `iphone_defect_name` value
10. Writes a new `iphone_defect_name` value
11. Verifies the write by reading the value back
12. Calls the `sound_the_alarm` method with an alarm message
13. Creates a subscription to monitor `production_line_status` changes for 10 seconds
14. Translates a browse path to find a node ID
15. Closes the session and disconnects

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

| Node ID                             | Data Type | Access     | Description                                                                                         |
| ----------------------------------- | --------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `ns=1;s=production_line_running`    | String    | Read-only  | Production line name (e.g., "Assembly Line 2")                                                      |
| `ns=1;s=production_line_status`     | String    | Read-only  | Production line status with timestamp that updates every second (e.g., "RUNNING \| 2026-01-26T...") |
| `ns=1;s=iphone_product_inspections` | Int32     | Read/Write | iPhone product inspection count (valid range: 0-100,000)                                            |
| `ns=1;s=iphone_defect_name`         | String    | Read/Write | iPhone defect name (valid length: 1-100 characters)                                                   |

## Methods Reference

| Node ID                  | Browse Name   | Input                  | Output                | Description                                                                  |
| ------------------------ | ------------- | ---------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `ns=1;s=sound_the_alarm` | SoundTheAlarm | String (alarm message) | String (alarm status) | Activates an alarm with the provided message and returns status confirmation |

## Project Structure

```
opc-ua-server/
├── src/
│   ├── server.js      # OPC UA server implementation
│   └── client.js      # OPC UA client implementation
├── Dockerfile         # Docker configuration
├── package.json       # Project dependencies and scripts
└── Readme.md          # This file
```

## License

ISC
