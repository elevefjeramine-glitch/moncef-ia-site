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
    if (url.pathname === "/api/invite" && request.method === "POST") {
      if (!ALLOWED_ORIGINS.has(origin)) {
        return json({ error: "Origin not allowed" }, 403, corsHeaders);
      }
      return handleInvite(request, env, corsHeaders);
    }
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

async function handleInvite(request, env, corsHeaders) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email format" }, 400, corsHeaders);
  }
  if (!env.RESEND_API_KEY || !env.INVITE_FROM_EMAIL) {
    return json(
      { error: "Invite email service is not configured on server" },
      503,
      corsHeaders,
    );
  }

  const inviteLink = "https://moncef-ia.pages.dev";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">Invitation Moncef IA</h2>
      <p>Bonjour,</p>
      <p>Vous etes invite(e) a rejoindre Moncef IA.</p>
      <p>
        <a href="${inviteLink}" style="display:inline-block;padding:10px 16px;background:#1A3CFF;color:#fff;text-decoration:none;border-radius:8px">
          Rejoindre Moncef IA
        </a>
      </p>
      <p>Ou utilisez ce lien : ${inviteLink}</p>
    </div>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.INVITE_FROM_EMAIL,
        to: [email],
        subject: "Invitation Moncef IA",
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      const msg = resendData?.message || "Email provider error";
      return json({ error: msg }, resendRes.status, corsHeaders);
    }
    return json({ ok: true, id: resendData?.id || null }, 200, corsHeaders);
  } catch {
    return json({ error: "Failed to send invite email" }, 502, corsHeaders);
  }
}

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
