import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new McpServer({
    name: "mcp-ts",
    version: "1.0.0",
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
    }
});

server.resource("users", "users://all",
    {
        description: "A resource containing all users",
        title: "Users",
        mimeType: "application/json",
    },
    async uri => {
        const users = await import("./data/users.json", {with: {type: "json"} }).then(m => m.default);
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify(users, null, 2),
                    mimeType: "application/json",
                }
            ]
        };
    }
);

server.resource("user-details", new ResourceTemplate("users://{id}/profile", {list: undefined}),
    {
        description: "A resource containing user details",
        title: "User Details",
        mimeType: "application/json",
    },
        async (uri, {id}) => {
        const users = await import("./data/users.json", {with: {type: "json"} }).then(m => m.default);
        const user = users.find(u => u.id === parseInt(id as string));
        if (!user) {
                return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify({ error: "User not found" }, null, 2),
                        mimeType: "application/json",
                    }
                ]
            };
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify(user, null, 2),
                    mimeType: "application/json",
                }
            ]
        };
    }
);

server.tool(
    'get-coordinates',
    'Tool to get coordinates information',
    {
        city: z.string().describe("City name to get the coordinates for"),
    },
    {
        title: "Get Coordinates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
    async ({ city }) => {
        try
        {
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=10&language=en&format=json`);
            const data = await response.json();

            if (data.results.length === 0) 
            {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No data found for ${city}.`,
                        }
                    ]
                };
            }

            const latitude = data.results[0].latitude;
            const longitude = data.results[0].longitude;

            return {
                content: [
                    {
                        type: "text",
                        text: `Data for ${city} is ${latitude || "unknown"} and ${longitude || "unknown"}!`,
                    }
                ]
            };
        }
        catch (error) 
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error fetching coordinates data for ${city}: ${errorMessage}`,
                    }
                ]
            };
        }
    }
);

server.tool('create-user','Create a new user in the database.',
    {
        name: z.string().describe("User name to create"),
        email: z.string().email().describe("User email to create"),
    },
    {
        title: "Create User",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
    async (params) => {
        try
        {
            const id = await createUser(params);
            return {
                content: [
                    {
                        type: "text",
                        text: `User ${id} created successfully: ${params.name} (${params.email})`,
                    }
                ]
            };
        }
        catch (error) 
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error creating user: ${errorMessage}`,
                    }
                ]
            };
        }        
    }    
);

server.tool("create-random-user", "Create a random user with fake data",
    {
        title: "Create Random User",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
    async () => {
        const res = await server.server.request({
            method: "sampling/createMessage",
            params: {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: "Create a random user with fake data. The user should have a name, a valid email address and a unique int Id. Return this data as a JSON object."
                    }
                }],
                maxTokens: 1024
            }
        }, CreateMessageResultSchema);

        console.log(res.content.text);

        if (res.content.type !== "text") {
            return {
                content: [{
                    type: "text",
                    text: "Error: Failed to generate fake user data."
                }]
            }
        }
        try {
            const fakeUser = JSON.parse(res.content.text.trim().replace(/^```json/,"").replace(/```$/, "").trim());
            const id = await createUser(fakeUser);
            return {
                content: [{
                    type: "text",
                    text: `Fake user created successfully: ${id}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`
                }]
            }
        }
    }
);

server.prompt("generate-fake-user", "Generate a fake user for a given name", 
    {
        name: z.string().describe("Name of the user to generate"),
    },
    ({name}) => {
        return {
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Generate a fake user with the name ${name}. The user should have a valid email address and a unique Id.`
                }
            }]
        }
    }
);

async function createUser(user: {
    name: string,
    email: string
}) {
    const users = await import("./data/users.json", {with: {type: "json"} }).then(m => m.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await fs.writeFile("./data/users.json", JSON.stringify(users, null, 2));
    return id;
}

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main()