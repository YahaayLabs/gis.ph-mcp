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
  options?: { params?: Record<string, string>; method?: string; body?: unknown }
): Promise<unknown> {
  const url = new URL(BASE_URL + path);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url.toString(), {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`gis.ph API error ${response.status}: ${error}`);
  }
  return response.json();
}

function buildMcpServer(apiKey: string): McpServer {
  const server = new McpServer({ name: "gis-ph", version: "1.0.0" });

  // ── Regions ────────────────────────────────────────────────────────────
  server.tool("get_regions", "Get all regions in the Philippines", {}, async () => {
    const data = await gisApi("/regions", apiKey);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool(
    "get_region",
    "Get details of a specific region by its code",
    { region_code: z.string().describe("Region code") },
    async ({ region_code }) => {
      const data = await gisApi(`/regions/${region_code}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Provinces ──────────────────────────────────────────────────────────
  server.tool("get_provinces", "Get all provinces in the Philippines", {}, async () => {
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

  // ── Municities ─────────────────────────────────────────────────────────
  server.tool(
    "get_municities",
    "Get all cities and municipalities, optionally filtered by province",
    { province_code: z.string().optional().describe("Province code to filter by") },
    async ({ province_code }) => {
      const data = await gisApi("/municities", apiKey, province_code ? { params: { province_code } } : undefined);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_municity",
    "Get details of a specific city or municipality by its code",
    { municity_code: z.string().describe("City or municipality code") },
    async ({ municity_code }) => {
      const data = await gisApi(`/municities/${municity_code}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Barangays ──────────────────────────────────────────────────────────
  server.tool(
    "get_barangays",
    "Get all barangays, optionally filtered by municity or province",
    {
      municity_code: z.string().optional().describe("City/municipality code to filter by"),
      province_code: z.string().optional().describe("Province code to filter by"),
    },
    async ({ municity_code, province_code }) => {
      const params: Record<string, string> = {};
      if (municity_code) params.municity_code = municity_code;
      if (province_code) params.province_code = province_code;
      const data = await gisApi("/barangays", apiKey, { params });
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

  // ── Datasets ───────────────────────────────────────────────────────────
  server.tool(
    "list_datasets",
    "List all datasets, optionally including their features",
    { include_features: z.boolean().optional().describe("Include features in each dataset") },
    async ({ include_features }) => {
      const params: Record<string, string> = {};
      if (include_features) params.includeFeatures = "true";
      const data = await gisApi("/datasets", apiKey, { params });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_dataset",
    "Get a single dataset by its ID",
    { dataset_id: z.string().describe("Dataset UUID") },
    async ({ dataset_id }) => {
      const data = await gisApi(`/datasets/${dataset_id}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "create_dataset",
    "Create a new dataset, optionally with features",
    {
      name: z.string().describe("Dataset name"),
      description: z.string().optional().describe("Dataset description"),
      data_type: z.enum(["vector", "raster"]).optional().describe("Data type"),
      geometry_type: z.enum(["POINT", "LINESTRING", "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON"]).optional().describe("Geometry type"),
      srid: z.number().optional().describe("Spatial reference ID, default 4326"),
    },
    async ({ name, description, data_type, geometry_type, srid }) => {
      const body: Record<string, unknown> = { name };
      if (description) body.description = description;
      if (data_type) body.data_type = data_type;
      if (geometry_type) body.geometry_type = geometry_type;
      if (srid) body.srid = srid;
      const data = await gisApi("/datasets", apiKey, { method: "POST", body });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "update_dataset",
    "Update an existing dataset",
    {
      dataset_id: z.string().describe("Dataset UUID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    async ({ dataset_id, name, description }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (description) body.description = description;
      const data = await gisApi(`/datasets/${dataset_id}`, apiKey, { method: "PATCH", body });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Features ───────────────────────────────────────────────────────────
  server.tool(
    "list_features",
    "List all features",
    {},
    async () => {
      const data = await gisApi("/features", apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_feature",
    "Get a single feature by its ID",
    { feature_id: z.string().describe("Feature ID") },
    async ({ feature_id }) => {
      const data = await gisApi(`/features/${feature_id}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_features_by_dataset",
    "Get all features belonging to a dataset",
    { dataset_id: z.string().describe("Dataset UUID") },
    async ({ dataset_id }) => {
      const data = await gisApi(`/features/dataset/${dataset_id}`, apiKey);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "create_feature",
    "Create a new feature in a dataset",
    {
      dataset_id: z.string().describe("Dataset UUID"),
      geometry: z.object({
        type: z.string().describe("GeoJSON geometry type e.g. Point, Polygon"),
        coordinates: z.array(z.unknown()).describe("GeoJSON coordinates"),
      }).describe("GeoJSON geometry object"),
      properties: z.record(z.unknown()).optional().describe("Feature properties as key-value pairs"),
    },
    async ({ dataset_id, geometry, properties }) => {
      const body: Record<string, unknown> = { dataset_id, geometry };
      if (properties) body.properties = properties;
      const data = await gisApi("/features", apiKey, { method: "POST", body });
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
    tools: [
      "get_regions", "get_region",
      "get_provinces", "get_province",
      "get_municities", "get_municity",
      "get_barangays", "get_barangay",
      "list_datasets", "get_dataset", "create_dataset", "update_dataset",
      "list_features", "get_feature", "get_features_by_dataset", "create_feature",
    ],
  })
);

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