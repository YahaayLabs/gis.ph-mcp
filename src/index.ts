import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
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

function buildMcpServer(apiKey: string): McpServer {
  const server = new McpServer({ name: "gis-ph", version: "1.0.0" });

  server.tool("debug_key", "Show key info for debugging", {}, async () => ({
    content: [{ type: "text", text: JSON.stringify({ key_length: apiKey.length, key_preview: apiKey.substring(0, 4) }) }],
  }));

  server.tool("get_provinces", "Get all 81 provinces in the Philippines", {}, async () => {
    const data = await gisApi("/provinces", apiKey);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool(
    "get_province",
    "Get details of a specific province by its code",
    { province_code: z.string().describe("Province code e.g. '1400100000'") },
    async ({ province_code }) => {
      const data = await gisApi(`/provinces/${province_code}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_cities",
    "Get all cities and municipalities, optionally filtered by province",
    { province_code: z.string().optional().describe("Province code to filter by") },
    async ({ province_code }) => {
      const data = await gisApi("/cities", apiKey, province_code ? { province_code } : undefined);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_city",
    "Get details of a specific city or municipality by its code",
    { city_code: z.string().describe("City or municipality code") },
    async ({ city_code }) => {
      const data = await gisApi(`/cities/${city_code}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
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
      const data = await gisApi("/barangays", apiKey, params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_barangay",
    "Get details of a specific barangay by its code",
    { barangay_code: z.string().describe("Barangay code") },
    async ({ barangay_code }) => {
      const data = await gisApi(`/barangays/${barangay_code}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search_location",
    "Search for any location in the Philippines by name",
    {
      query: z.string().describe("Location name to search"),
      type: z.enum(["province", "city", "municipality", "barangay"]).optional(),
    },
    async ({ query, type }) => {
      const params: Record<string, string> = { q: query };
      if (type) params.type = type;
      const data = await gisApi("/search", apiKey, params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "reverse_geocode",
    "Find the barangay, city, and province for given coordinates",
    {
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
    },
    async ({ lat, lng }) => {
      const data = await gisApi("/reverse-geocode", apiKey, {
        lat: String(lat),
        lng: String(lng),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_demographics",
    "Get demographic and population data for a location",
    {
      location_code: z.string().describe("Province, city, or barangay code"),
      level: z.enum(["province", "city", "barangay"]).describe("Geographic level"),
    },
    async ({ location_code, level }) => {
      const data = await gisApi("/analytics/demographics", apiKey, {
        code: location_code,
        level,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({
    name: "gis.ph MCP Server",
    version: "1.0.0",
    auth: "Pass your gis.ph API key via ?key= query param or x-api-key header",
    endpoint: "https://mcp.gis.ph/mcp?key=YOUR_KEY",
  })
);

// Single endpoint — handles everything (GET for SSE stream, POST for messages)
app.all("/mcp", async (c) => {
  const apiKey = c.req.query("key") ?? c.req.header("x-api-key") ?? "";

  if (!apiKey) {
    return c.json({ error: "Missing API key. Add ?key=YOUR_KEY to the URL." }, 401);
  }

  const server = buildMcpServer(apiKey);
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;