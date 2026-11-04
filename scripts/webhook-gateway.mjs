import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.LENDLOOP_GATEWAY_PORT || 8787);
const upstream = "http://127.0.0.1:5678/webhook/lendloop-events";
const route = "/webhook/lendloop-events";
const maxBytes = 4096;

// This local-only gateway is intended for a temporary HTTPS tunnel. It never
// exposes the n8n editor/API and forwards the raw request bytes unchanged.
createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== route) {
    response.writeHead(404).end();
    return;
  }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    response.writeHead(415).end();
    return;
  }
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const payload = Buffer.concat(chunks);
    const forwarded = await fetch(upstream, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lendloop-timestamp": String(request.headers["x-lendloop-timestamp"] || ""),
        "x-lendloop-signature": String(request.headers["x-lendloop-signature"] || ""),
      },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    const body = await forwarded.text();
    response.writeHead(forwarded.status, {
      "content-type": forwarded.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    }).end(body);
  } catch {
    response.writeHead(502, { "content-type": "application/json" }).end('{"error":"Upstream unavailable"}');
  }
}).listen(port, host, () => {
  console.log(`LendLoop webhook-only gateway listening on http://${host}:${port}`);
  console.log(`Allowing only POST ${route}; n8n's admin UI stays local.`);
});
