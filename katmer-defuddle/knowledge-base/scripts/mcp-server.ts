#!/usr/bin/env tsx
import "dotenv/config";
import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  searchInternalKnowledge,
  searchWebLatest,
} from "../src/lib/vector-search.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const server = new Server(
  {
    name: "katmer-base-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_knowledge_base",
        description:
          "Search the internal Katmer Knowledge Base (RAG) using vector similarity.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query or keyword.",
            },
            limit: {
              type: "number",
              description: "Maximum number of documents to return (default 5).",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_document_by_id",
        description:
          "Get the full content of a specific document from the Katmer Knowledge Base using its ID.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The ID of the document.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "search_web_latest",
        description:
          "Search the web for the latest information using DuckDuckGo.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query.",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "search_knowledge_base") {
      const query = String(args?.query);
      const limit = args?.limit ? Number(args.limit) : 5;

      const results = await searchInternalKnowledge(query, limit);

      if (!results || results.length === 0) {
        return {
          content: [
            { type: "text", text: "No results found in the knowledge base." },
          ],
        };
      }

      const formattedResults = results
        .map(
          (r) =>
            `ID: ${r.id}\nTitle: ${r.title}\nSimilarity: ${r.similarity.toFixed(2)}\nContent Snippet: ${r.content.substring(0, 1000)}...`,
        )
        .join("\n\n---\n\n");

      return {
        content: [{ type: "text", text: formattedResults }],
      };
    }

    if (name === "get_document_by_id") {
      const id = String(args?.id);

      const doc = await prisma.knowledgeDocument.findUnique({
        where: { id },
      });

      if (!doc) {
        return {
          content: [
            { type: "text", text: `Document with ID ${id} not found.` },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Title: ${doc.title}\nTags: ${doc.tags || "none"}\n\n${doc.content}`,
          },
        ],
      };
    }

    if (name === "search_web_latest") {
      const query = String(args?.query);
      const result = await searchWebLatest(query);
      return {
        content: [{ type: "text", text: result }],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ...

const MODE = process.env.MCP_MODE || "stdio";

async function startSseServer() {
  const app = express();
  app.use(cors());

  let transport: SSEServerTransport;

  app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/message", res);
    await server.connect(transport);
  });

  app.post("/message", async (req, res) => {
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(500).send("SSE transport not initialized");
    }
  });

  const PORT = process.env.KATMER_MCP_PORT || 8002;
  app.listen(PORT, () => {
    console.error(
      `Katmer Base MCP Server running on http://localhost:${PORT}/sse`,
    );
  });
}

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Katmer Base MCP Server running on stdio");
}

if (MODE === "sse") {
  startSseServer().catch((error) => {
    console.error("Fatal error running SSE MCP server:", error);
    process.exit(1);
  });
} else {
  startStdioServer().catch((error) => {
    console.error("Fatal error running stdio MCP server:", error);
    process.exit(1);
  });
}
