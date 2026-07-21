// SN105 (Beam) end-to-end verification for the call_subnet_surface MCP tool
// (metagraphed#7116, MCP execute Phase 1 follow-up #7014/#7215). Unlike
// tests/call-subnet-surface-mcp.test.mjs -- which proves the tool wiring with
// synthetic surfaces -- this file pins SN105's five callable registry surfaces
// (registry/subnets/beam.json) to the tool's contract, so a future edit that
// regresses their callability is caught here.
//
// All five live-verified 2026-07-21 to return HTTP 200 application/json:
//   - sn-105-beam-openapi                 GET https://beamcore.b1m.ai/openapi.json
//   - sn-105-beam-health                  GET https://beamcore.b1m.ai/health
//   - sn-105-beam-routing-orchestrators   GET https://beamcore.b1m.ai/routing/orchestrators
//   - sn-105-beam-worker-capacity         GET https://beamcore.b1m.ai/routing/worker-capacity
//   - sn-105-beam-validators-orchestrators GET https://beamcore.b1m.ai/validators/orchestrators
//
// Note on sn-105-beam-openapi: kind "openapi" is not in OPERATIONAL_SURFACE_KINDS
// (src/health-probe-core.mjs), so that surface is absent from the real
// public/metagraph/operational-surfaces.json and cannot be resolved by
// surface_id through the MCP tool -- it is verified direct-call only (matching
// the SN85 precedent). The four subnet-api surfaces are operational and carry
// probe blocks with GET/json. Fixtures below mirror each live response's
// top-level shape rather than fetching it, keeping the test hermetic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { callSubnetSurface } from "../src/call-subnet-surface.mjs";
import { OPERATIONAL_SURFACE_KINDS } from "../src/health-probe-core.mjs";
import { handleMcpRequest } from "../src/mcp-server.mjs";

const NETUID = 105;

const registry = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../registry/subnets/beam.json", import.meta.url)),
    "utf8",
  ),
);
const surfaceById = (id) => registry.surfaces.find((s) => s.id === id);

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function callThroughMcpTool(surface, body) {
  const catalog = {
    surfaces: [{ ...surface, surface_id: surface.id, netuid: NETUID }],
  };
  const deps = {
    readArtifact: async (_env, path) =>
      path === "/metagraph/operational-surfaces.json"
        ? { ok: true, data: catalog }
        : { ok: false, status: 404 },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      return new Response(JSON.stringify({ Status: 0 }), {
        headers: { "content-type": "application/dns-json" },
      });
    }
    return jsonResponse(body);
  };
  try {
    const httpResponse = await handleMcpRequest(
      new Request("https://metagraph.sh/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "call_subnet_surface",
            arguments: { surface_id: surface.id },
          },
        }),
      }),
      {},
      deps,
    );
    return (await httpResponse.json()).result;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const SURFACES = [
  {
    id: "sn-105-beam-openapi",
    kind: "openapi",
    operational: false,
    url: "https://beamcore.b1m.ai/openapi.json",
    hasSchema: true,
    body: {
      openapi: "3.0.3",
      info: { title: "BeamCore API", version: "0.1.0" },
      paths: {},
    },
    assertShape: (body) => {
      assert.equal(body.openapi, "3.0.3");
      assert.equal(body.info.title, "BeamCore API");
    },
  },
  {
    id: "sn-105-beam-health",
    kind: "subnet-api",
    operational: true,
    url: "https://beamcore.b1m.ai/health",
    hasSchema: false,
    body: {
      ok: true,
      db: "up",
      schema: { ok: true, version: "2026-07-18_transfer_normalized_prism_bw" },
    },
    assertShape: (body) => {
      assert.equal(body.ok, true);
      assert.equal(body.db, "up");
      assert.equal(typeof body.schema, "object");
    },
  },
  {
    id: "sn-105-beam-routing-orchestrators",
    kind: "subnet-api",
    operational: true,
    url: "https://beamcore.b1m.ai/routing/orchestrators",
    hasSchema: false,
    body: [
      {
        hotkey: "5FTVgJ5UZUphktpW6ykTFdDd1aEQG68MgngF4geipBvuTpag",
        url: "http://88.216.73.2:8000",
        region: "US",
      },
    ],
    assertShape: (body) => {
      assert.ok(Array.isArray(body));
      assert.equal(typeof body[0].hotkey, "string");
      assert.equal(typeof body[0].region, "string");
    },
  },
  {
    id: "sn-105-beam-worker-capacity",
    kind: "subnet-api",
    operational: true,
    url: "https://beamcore.b1m.ai/routing/worker-capacity",
    hasSchema: false,
    body: { total_workers: 0, by_orchestrator: {} },
    assertShape: (body) => {
      assert.equal(typeof body.total_workers, "number");
      assert.equal(typeof body.by_orchestrator, "object");
    },
  },
  {
    id: "sn-105-beam-validators-orchestrators",
    kind: "subnet-api",
    operational: true,
    url: "https://beamcore.b1m.ai/validators/orchestrators",
    hasSchema: false,
    body: {
      orchestrators: [
        {
          uid: 1,
          hotkey: "5HH1uuokc4iPnqqVX1Qj7dnehmz2ptmSY5cGSMuUkyJpHYUD",
          status: "active",
          worker_count: 0,
        },
      ],
    },
    assertShape: (body) => {
      assert.ok(Array.isArray(body.orchestrators));
      assert.equal(typeof body.orchestrators[0].uid, "number");
      assert.equal(typeof body.orchestrators[0].hotkey, "string");
    },
  },
];

for (const spec of SURFACES) {
  describe(`SN105 Beam ${spec.id} call_subnet_surface verification (#7116)`, () => {
    const SURFACE = surfaceById(spec.id);

    test("the registry surface exists and is configured to be callable", () => {
      assert.ok(SURFACE, `registry surface ${spec.id} is present`);
      assert.equal(SURFACE.kind, spec.kind);
      assert.equal(SURFACE.auth_required, false);
      assert.equal(SURFACE.url, spec.url);
      assert.equal(SURFACE.probe?.enabled, true);
      assert.equal(SURFACE.probe?.method, "GET");
      assert.equal(SURFACE.probe?.expect, "json");
      if (spec.hasSchema) {
        assert.equal(SURFACE.schema_url, spec.url);
      } else {
        assert.equal(SURFACE.schema_url, undefined);
      }
    });

    test("callSubnetSurface issues a GET to the surface's own url and returns the JSON body", async () => {
      let requestedUrl;
      let requestedMethod;
      const result = await callSubnetSurface(SURFACE, {
        isUnsafeUrl: async () => false,
        fetchImpl: async (url, init) => {
          requestedUrl = String(url);
          requestedMethod = init.method;
          return jsonResponse(spec.body);
        },
      });
      assert.equal(result.ok, true);
      assert.equal(requestedUrl, SURFACE.url);
      assert.equal(requestedMethod, "GET");
      assert.equal(result.status_code, 200);
      assert.equal(result.content_type, "application/json");
      spec.assertShape(result.body);
    });

    if (spec.operational) {
      test("end-to-end through the call_subnet_surface MCP tool, resolved by surface id", async () => {
        assert.ok(OPERATIONAL_SURFACE_KINDS.includes(spec.kind));
        const result = await callThroughMcpTool(SURFACE, spec.body);
        assert.equal(result.isError, false);
        assert.equal(result.structuredContent.surface_id, spec.id);
        assert.equal(result.structuredContent.status_code, 200);
        spec.assertShape(result.structuredContent.body);
      });
    } else {
      test("kind is not an operational kind, so this surface is direct-call verified only", () => {
        assert.ok(!OPERATIONAL_SURFACE_KINDS.includes(spec.kind));
        assert.ok(OPERATIONAL_SURFACE_KINDS.includes("subnet-api"));
      });
    }
  });
}
