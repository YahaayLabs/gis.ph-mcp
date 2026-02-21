# GIS.ph MCP Server

MCP (Model Context Protocol) server for [gis.ph](https://gis.ph) — the Philippines Geographic Information System API.

Deployed at **https://mcp.gis.ph**

---

## Tools

| Tool | Description |
|---|---|
| `get_provinces` | All 81 provinces |
| `get_province` | Single province by code |
| `get_cities` | Cities/municipalities, filterable by province |
| `get_city` | Single city by code |
| `get_barangays` | Barangays, filterable by city or province |
| `get_barangay` | Single barangay by code |
| `search_location` | Search any location by name |
| `reverse_geocode` | Find location from lat/lng coordinates |
| `get_demographics` | Population and demographic data |

---

## Development

### Prerequisites
- Node.js 18+
- Cloudflare account with Workers enabled
- gis.ph API key

### Setup

```bash
npm install
```

### Local dev

```bash
# Copy and fill in your API key
cp .dev.vars .dev.vars.local

# Start local dev server
npm run dev
```

### Deploy to mcp.gis.ph

```bash
# Set your API key as a Cloudflare secret (one-time)
wrangler secret put GIS_PH_API_KEY

# Deploy
npm run deploy
```

---

## Connecting to Claude

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "gis-ph": {
      "url": "https://mcp.gis.ph/sse"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add gis-ph --url https://mcp.gis.ph/sse
```

---

## Endpoints

| Endpoint | Transport | Use |
|---|---|---|
| `https://mcp.gis.ph/sse` | SSE | Claude Desktop, most MCP clients |
| `https://mcp.gis.ph/mcp` | HTTP | Programmatic / API clients |
| `https://mcp.gis.ph/` | JSON | Health check / info |
