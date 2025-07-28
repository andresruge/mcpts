# Building a MCP Weather Server

A sample can be found [here](https://github.com/microsoft/lets-learn-mcp-javascript)

## 1. Setting up the project

**1. Initialize**
```bash
mkdir mcp-ts
cd mcp-ts
npm init -y
```

**2. Create Main file**
```bash
New-Item -Path .\main.ts -ItemType File
```

**3. Configure package.json**
```json
"type": "module"
```

## 2. Install depedencies

**1. Install mcp sdk**
```bash
npm install @modelcontextprotocol/sdk
```

**2. Install Zod**
```bash
npm install zod
```

## 3. Building the Basic mcp server
Check code in main.ts.

**1. Add imports**
**2. Create server instance**
**3. Define tools, resources, prompts**
**4. Set up communication**
**5. Test it**
```bash
npx -y @modelcontextprotocol/inspector npx tsx main.ts
```
This should open the inspector page.

**6. Alternative way to test**
Install inspector
```bash
npm i -D @modelcontextprotocol/inspector
```
And then configure the script to run.

## 4. Building the client
Check code in client.ts

**1. Add imports**
**2. Create client instance**
**3. Install inquirer**
```bash
npm i @inquirer/prompts dotenv
```
**4. Create .env file**
**5. Install ai library**
```bash
npm i ai @ai-sdk/google
```