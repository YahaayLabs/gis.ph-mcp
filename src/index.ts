import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
}

interface State {
  apiKey: string;
}

const BASE_URL = "https://api.gis.ph/v1";

async function gisApi(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`gis.ph API error ${response.status}: ${error}`);
  }
  return response.json();
}

// State (2nd generic) is persisted automatically by McpAgent via DO storage
// Props (3rd generic) are passed in per-request from the worker fetch handler
export class GisPhMCP extends McpAgent<Env, State, { apiKey: string }> {
  server = new McpServer({ name: "gis-ph", version: "1.0.0" });

  initialState: State = { apiKey: "" };

  async init() {
    // Persist the key into Agent state on first connect
    if (this.props.apiKey) {
      this.setState({ apiKey: this.props.apiKey });
    }

    this.server.tool("get_provinces", "Get all 81 provinces in the Philippines", {}, async () => {
      const data = await gisApi("/provinces", this.state.apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    });

    this.server.tool(
      "get_province",
      "Get details of a specific province by its code",
      { province_code: z.string().describe("Province code e.g. '1400100000'") },
      async ({ province_code }) => {
        const data = await gisApi(`/provinces/${province_code}`, this.state.apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "get_cities",
      "Get all cities and municipalities, optionally filtered by province",
      { province_code: z.string().optional().describe("Province code to filter by") },
      async ({ province_code }) => {
        const data = await gisApi("/cities", this.state.apiKey, province_code ? { province_code } : undefined);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "get_city",
      "Get details of a specific city or municipality by its code",
      { city_code: z.string().describe("City or municipality code") },
      async ({ city_code }) => {
        const data = await gisApi(`/cities/${city_code}`, this.state.apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "get_barangays",
      "Get all barangays, optionally filtered by city or province",
      {
        city_code: z.string().optional().describe("City/municipality code to filter by"),
        province_code: z.string().optional().describe("Province code to filter by"),
      },
      async ({ city_code, province_code }) => {
        const params: Record<string, string> = {};
        if (city_code) params.city_code = city_code;
        if (province_code) params.province_code = province_code;
        const data = await gisApi("/barangays", this.state.apiKey, params);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "get_barangay",
      "Get details of a specific barangay by its code",
      { barangay_code: z.string().describe("Barangay code") },
      async ({ barangay_code }) => {
        const data = await gisApi(`/barangays/${barangay_code}`, this.state.apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "search_location",
      "Search for any location in the Philippines by name",
      {
        query: z.string().describe("Location name to search"),
        type: z.enum(["province", "city", "municipality", "barangay"]).optional(),
      },
      async ({ query, type }) => {
        const params: Record<string, string> = { q: query };
        if (type) params.type = type;
        const data = await gisApi("/search", this.state.apiKey, params);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "reverse_geocode",
      "Find the barangay, city, and province for given coordinates",
      {
        lat: z.number().describe("Latitude"),
        lng: z.number().describe("Longitude"),
      },
      async ({ lat, lng }) => {
        const data = await gisApi("/reverse-geocode", this.state.apiKey, {
          lat: String(lat),
          lng: String(lng),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.tool(
      "get_demographics",
      "Get demographic and population data for a location",
      {
        location_code: z.string().describe("Province, city, or barangay code"),
        level: z.enum(["province", "city", "barangay"]).describe("Geographic level"),
      },
      async ({ location_code, level }) => {
        const data = await gisApi("/analytics/demographics", this.state.apiKey, {
          code: location_code,
          level,
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          name: "gis.ph MCP Server",
          version: "1.0.0",
          auth: "Pass your gis.ph API key via ?key= query param or x-api-key header",
          endpoints: { sse: "https://mcp.gis.ph/sse?key=YOUR_KEY" },
        }, null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = url.searchParams.get("key") ?? request.headers.get("x-api-key") ?? "";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing API key. Add ?key=YOUR_KEY to the URL." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
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
