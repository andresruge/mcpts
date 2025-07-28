import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { input, select, confirm } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateMessageRequestSchema, Prompt, PromptMessage, Tool } from "@modelcontextprotocol/sdk/types.js";
import { generateText, jsonSchema, ToolSet } from "ai";

const mcpClient = new Client(
    {
        name: "mcp-ts-client",
        version: "1.0.0"
    },
    {
        capabilities: { sampling: {} },
    }
);

const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "main.ts"],
    stderr: "ignore"
});

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function main() {
    await mcpClient.connect(transport);
    const [{ tools }, { resources }, { resourceTemplates }, { prompts }] = await Promise.all(
        [
            mcpClient.listTools(),
            mcpClient.listResources(),
            mcpClient.listResourceTemplates(),
            mcpClient.listPrompts()
        ]
    );

    mcpClient.setRequestHandler(CreateMessageRequestSchema, async (request) => {
        let texts: string[] = [];
        for (const message of request.params.messages) {
            const text = await handleServerMessagePrompt(message);
            if (text) {
                texts.push(text);
            }            
        }

        return {
            role: "user",
            model: "google/gemini-2.0-flash",
            stopReason: "endTurn",
            content: {
                type: "text",
                text: texts.join("\n")
            }
        };
    });

    console.log("Connected!");

    while (true) {
        const option = await select({
            message: "Select an option",
            choices: ["Query", "Tools", "Resources", "Prompts", "Exit"]
        })

        switch (option) {
            case "Query":
                await handleQuery(tools);
                break;
            case "Tools":
                const toolName = await select({
                    message: "Select a tool",
                    choices: tools.map(tool => ({
                        name: tool.annotations?.title || tool.name,
                        value: tool.name,
                        description: tool.description || "No description available"
                    }))
                });
                console.log(`Selected tool: ${toolName}`);
                const tool = tools.find(t => t.name === toolName);
                if (!tool) {
                    console.error("Tool not found");
                    continue;
                }else{
                    await handleTool(tool);
                }
                break;
            case "Resources":
                const resourceUri = await select({
                    message: "Select a resource",
                    choices: [
                            ...resources.map(resource => ({
                            name: resource.name,
                            value: resource.uri,
                            description: resource.description || "No description available"
                        })),
                        ...resourceTemplates.map(template => ({
                            name: template.name,
                            value: template.uriTemplate,
                            description: template.description || "No description available"
                        }))
                    ]
                });
                console.log(`Selected resource: ${resourceUri}`);
                const resource = resources.find(r => r.uri === resourceUri)?.uri ??
                    resourceTemplates.find(t => t.uriTemplate === resourceUri)?.uriTemplate;
                if (!resource) {
                    console.error("Resource not found");
                    continue;
                }else{
                    await handleResource(resource);
                }
                break;
            case "Prompts":
                const promptName = await select({
                    message: "Select a prompt",
                    choices: prompts.map(prompt => ({
                        name: prompt.name,
                        value: prompt.name,
                        description: prompt.description || "No description available"
                    }))
                });
                console.log(`Selected prompt: ${promptName}`);
                const prompt = prompts.find(p => p.name === promptName);
                if (!prompt) {
                    console.error("Prompt not found");
                    continue;
                }else{
                    await handlePrompt(prompt);
                }
                break;
            case "Exit":
                console.log("Exiting...");
                return;
        }
    }
}

async function handleTool(tool: Tool) {
    console.log(`Handling tool: ${tool.name}`);
    
    const args: Record<string, string> = {};
    for (const [key, value] of Object.entries(tool.inputSchema.properties ?? {})) {
        args[key] = await input({
            message: `Enter value for ${key} (${(value as {type: string}).type}):`
        });
    }

    const res = await mcpClient.callTool({
        name: tool.name,
        arguments: args
    });

    console.log(`Tool response: ${(res.content as [{text:string}])[0].text}`);
};

async function handleResource(uri: string) {
    console.log(`Handling resource: ${uri}`);
    
    let finalUri = uri;
    const paramMatches = uri.match(/{([^}]+)}/g);
    
    if (paramMatches != null) {
        for (const paramMatch of paramMatches) {
            const paramName = paramMatch.replace("{","").replace("}","");
            const paramValue = await input(
                {message: `Enter value for ${paramName}:`}
            );
            finalUri = finalUri.replace(paramMatch, paramValue);
        }
    }

    const res = await mcpClient.readResource({
        uri: finalUri
    });

    console.log(`Resource response: ${JSON.stringify(JSON.parse((res.contents[0].text as string)), null, 2)}`);
};

async function handlePrompt(prompt: Prompt) {
    console.log(`Handling prompt: ${prompt.name}`);

    const args: Record<string, string> = {};
    for (const arg of prompt.arguments ?? []) {
        args[arg.name] = await input({
            message: `Enter value for ${arg.name}:`
        });
    }

    const res = await mcpClient.getPrompt({
        name: prompt.name,
        arguments: args
    });

    for (const message of res.messages) {   
        console.log(`Prompt response: ${await handleServerMessagePrompt(message)}`);
    }
};

async function handleServerMessagePrompt(message: PromptMessage){
    if (message.content.type !== "text") {
        return `Unsupported content type: ${message.content.type}`;
    }

    console.log(message.content.text);
    const run = await confirm({
        message: "Do you want to run this prompt?",
        default: true
    });

    if (!run) {
        return "Prompt execution cancelled.";
    }

    const {text} =  await generateText({
        model: google("gemini-2.0-flash"),
        prompt: message.content.text,
        maxTokens: 1024,
    });

    return text;
}

async function handleQuery(tools: Tool[]){
    const query = await input({
        message: "Enter your query:"
    });

    const { text, toolResults} = await generateText({
        model: google("gemini-2.0-flash"),
        prompt: query,
        maxTokens: 1024,
        tools: tools.reduce((obj, tool) => ({
            ...obj,
            [tool.name]: {
                description: tool.description || "No description available",
                parameters: jsonSchema(tool.inputSchema),
                execute: async (args: Record<string, any>) => {
                    return await mcpClient.callTool({
                        name: tool.name,
                        arguments: args
                    });
                }
            }
        }), {} as ToolSet)
    });

    // @ts-expect-error
    console.log(`Query response: ${text || toolResults[0]?.result?.content[0]?.text || "No response generated."}`);
}

main();