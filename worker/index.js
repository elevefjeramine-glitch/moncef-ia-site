const ALLOWED_ORIGINS = new Set([
  "https://elevefjeramine-glitch.github.io",
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const ipBuckets = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "null";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/claude" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, corsHeaders);
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin not allowed" }, 403, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    const { model, max_tokens, system, messages } = payload || {};
    if (!model || !Array.isArray(messages)) {
      return json({ error: "Missing required fields" }, 400, corsHeaders);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server not configured: missing API key" }, 500, corsHeaders);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return json({ error: "Too many requests. Please retry in one minute." }, 429, corsHeaders);
    }

    try {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: max_tokens || 1024,
          system: system || "",
          messages,
        }),
      });

      const data = await anthropicRes.json();
      if (!anthropicRes.ok) {
        const msg = data?.error?.message || "Upstream Anthropic error";
        return json({ error: msg }, anthropicRes.status, corsHeaders);
      }

      const reply = data?.content?.[0]?.text || "...";
      return json({ reply, raw: data }, 200, corsHeaders);
    } catch {
      return json({ error: "Proxy request failed" }, 502, corsHeaders);
    }
  },
};

function checkRateLimit(ip) {
  const now = Date.now();
  const existing = ipBuckets.get(ip);
  if (!existing || now >= existing.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  existing.count += 1;
  return true;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
