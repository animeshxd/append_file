#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new McpServer({
    name: "append_file",
    version: "1.0.0",
});

function CreateError(message: string): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: message,
            },
        ],
        isError: true,
    };
}

async function needsNewline(filepath: string): Promise<boolean> {
    const fh = await fs.open(filepath, "r");
    try {
        const stat = await fh.stat();
        if (stat.size === 0) return false;

        const buffer = Buffer.alloc(1);
        await fh.read(buffer, 0, 1, stat.size - 1);
        return buffer[0] !== 0x0a; // 0x0A is '\n'
    } catch (_) {
        return false;
    } finally {
        await fh.close();
    }
}

server.tool(
    "append_file",
    "Append text to a file ensuring exactly one newline before appended content.",
    {
        content: z.string().describe("The text to append to the file."),
        absolute_path: z.string().describe("The path to the file to append to."),
    },
    async ({ content, absolute_path }) => {
        if (!path.isAbsolute(absolute_path)) {
            return CreateError(`Path ${absolute_path} is not absolute.`);
        }
        try {
            await fs.access(absolute_path);
        } catch (error) {
            return CreateError(`File ${absolute_path} does not exist.`);
        }
        const needs = await needsNewline(absolute_path);
        if (needs) {
            await fs.appendFile(absolute_path, "\n");
        }
        await fs.appendFile(absolute_path, content);

        return {
            content: [
                {
                    type: "text",
                    text: `Successfully appended ${content.length} bytes to ${absolute_path}.`,
                },
            ],
        };
    },
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("append_file MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
