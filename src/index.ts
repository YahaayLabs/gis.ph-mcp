import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  // No GIS_PH_API_KEY here anymore!
}

const BASE_URL = "https://api.gis.ph/v1";

// API key is now passed per-request via the x-api-key header
async function gisApi(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`gis.ph API error ${response.status}: ${error}`);
  }

  return response.json();
}

export class GisPhMCP extends McpAgent<Env, Record<string, never>, { apiKey: string }> {
  server = new McpServer({ name: "gis-ph", version: "1.0.0" });

  async init() {
    const { apiKey } = this.props; // injected from the request header

    this.server.tool("get_provinces", "Get all provinces", {}, async () => {
      const data = await gisApi("/provinces", apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    });

    // ... all other tools stay the same, just use apiKey from this.props
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Extract the user's API key from the request header
    const apiKey = request.headers.get("x-api-key") ?? "";

    if (!apiKey && url.pathname !== "/") {
      return new Response(
        JSON.stringify({ error: "Missing x-api-key header. Provide your gis.ph API key." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/") {
      return new Response(JSON.stringify({ name: "gis.ph MCP Server", version: "1.0.0" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return GisPhMCP.serveSSE("/sse", { props: { apiKey } }).fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return GisPhMCP.serve("/mcp", { props: { apiKey } }).fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
