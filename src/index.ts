import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment bindings (injected by Cloudflare Workers)
// ---------------------------------------------------------------------------
export interface Env {
  GIS_PH_API_KEY: string;
  MCP_OBJECT: DurableObjectNamespace;
}

const BASE_URL = "https://api.gis.ph/v1";

// ---------------------------------------------------------------------------
// Helper: call the gis.ph REST API
// ---------------------------------------------------------------------------
async function gisApi(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(BASE_URL + path);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
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

// ---------------------------------------------------------------------------
// MCP Agent (runs as a Cloudflare Durable Object)
// ---------------------------------------------------------------------------
export class GisPhMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "gis-ph",
    version: "1.0.0",
    description:
      "Access comprehensive geographic data for the Philippines — provinces, cities, municipalities, barangays, and more.",
  });

  async init() {
    const key = this.env.GIS_PH_API_KEY;

    // ── Provinces ────────────────────────────────────────────────────────────
    this.server.tool(
      "get_provinces",
      "Get all 81 provinces in the Philippines",
      {},
      async () => {
        const data = await gisApi("/provinces", key);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_province",
      "Get details of a specific province by its code",
      {
        province_code: z
          .string()
          .describe("Province code (e.g. '0128' for Metro Manila)"),
      },
      async ({ province_code }) => {
        const data = await gisApi(`/provinces/${province_code}`, key);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Cities & Municipalities ──────────────────────────────────────────────
    this.server.tool(
      "get_cities",
      "Get all cities and municipalities, optionally filtered by province",
      {
        province_code: z
          .string()
          .optional()
          .describe("Province code to filter cities/municipalities"),
      },
      async ({ province_code }) => {
        const data = await gisApi(
          "/cities",
          key,
          province_code ? { province_code } : undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_city",
      "Get details of a specific city or municipality by its code",
      {
        city_code: z.string().describe("City or municipality code"),
      },
      async ({ city_code }) => {
        const data = await gisApi(`/cities/${city_code}`, key);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Barangays ────────────────────────────────────────────────────────────
    this.server.tool(
      "get_barangays",
      "Get all barangays, optionally filtered by city or province",
      {
        city_code: z
          .string()
          .optional()
          .describe("City/municipality code to filter barangays"),
        province_code: z
          .string()
          .optional()
          .describe("Province code to filter barangays"),
      },
      async ({ city_code, province_code }) => {
        const params: Record<string, string> = {};
        if (city_code) params.city_code = city_code;
        if (province_code) params.province_code = province_code;
        const data = await gisApi("/barangays", key, params);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_barangay",
      "Get details of a specific barangay by its code",
      {
        barangay_code: z.string().describe("Barangay code"),
      },
      async ({ barangay_code }) => {
        const data = await gisApi(`/barangays/${barangay_code}`, key);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Search ───────────────────────────────────────────────────────────────
    this.server.tool(
      "search_location",
      "Search for any location in the Philippines by name",
      {
        query: z.string().describe("Location name to search"),
        type: z
          .enum(["province", "city", "municipality", "barangay"])
          .optional()
          .describe("Narrow results by location type"),
      },
      async ({ query, type }) => {
        const params: Record<string, string> = { q: query };
        if (type) params.type = type;
        const data = await gisApi("/search", key, params);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Reverse Geocoding ────────────────────────────────────────────────────
    this.server.tool(
      "reverse_geocode",
      "Find the barangay, city, and province for a given latitude/longitude",
      {
        lat: z.number().describe("Latitude (decimal degrees)"),
        lng: z.number().describe("Longitude (decimal degrees)"),
      },
      async ({ lat, lng }) => {
        const data = await gisApi("/reverse-geocode", key, {
          lat: String(lat),
          lng: String(lng),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    // ── Analytics ────────────────────────────────────────────────────────────
    this.server.tool(
      "get_demographics",
      "Get demographic and population data for a location",
      {
        location_code: z
          .string()
          .describe("Province, city, or barangay code"),
        level: z
          .enum(["province", "city", "barangay"])
          .describe("Geographic level of the location code"),
      },
      async ({ location_code, level }) => {
        const data = await gisApi(`/analytics/demographics`, key, {
          code: location_code,
          level,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Worker entry point — routes requests to the correct handler
// ---------------------------------------------------------------------------
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check / landing page
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify(
          {
            name: "gis.ph MCP Server",
            version: "1.0.0",
            description:
              "MCP server for accessing Philippines geographic data via gis.ph",
            endpoints: {
              sse: "https://mcp.gis.ph/sse",
              http: "https://mcp.gis.ph/mcp",
            },
            tools: [
              "get_provinces",
              "get_province",
              "get_cities",
              "get_city",
              "get_barangays",
              "get_barangay",
              "search_location",
              "reverse_geocode",
              "get_demographics",
            ],
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // SSE transport (used by Claude Desktop and most MCP clients)
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return GisPhMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    // HTTP transport (for programmatic / API-style clients)
    if (url.pathname === "/mcp") {
      return GisPhMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
