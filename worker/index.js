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

    // Endpoint pour les invitations (existant mais amélioré)
    if (url.pathname === "/api/invite" && request.method === "POST") {
      return handleEmailAction(request, env, corsHeaders, "invite");
    }

    // Nouvel endpoint pour les oublis de mot de passe
    if (url.pathname === "/api/forgot-password" && request.method === "POST") {
      return handleEmailAction(request, env, corsHeaders, "forgot");
    }

    // Nouvel endpoint pour la vérification de compte
    if (url.pathname === "/api/verify-account" && request.method === "POST") {
      return handleEmailAction(request, env, corsHeaders, "verify");
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

async function handleEmailAction(request, env, corsHeaders, type) {
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
      { error: "Email service is not configured on server" },
      503,
      corsHeaders,
    );
  }

  let subject = "";
  let html = "";
  const siteUrl = "https://moncef-ia.pages.dev";

  if (type === "invite") {
    subject = "Invitation à rejoindre Moncef IA";
    html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;padding:24px">
        <h2 style="color:#1A3CFF;margin-top:0">Invitation Moncef IA 🎓</h2>
        <p>Bonjour,</p>
        <p>Un ami vous a invité à rejoindre <b>Moncef IA</b>, la plateforme éducative intelligente.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${siteUrl}" style="display:inline-block;padding:14px 28px;background:#1A3CFF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
            Créer mon compte
          </a>
        </div>
        <p style="font-size:13px;color:#666">Si le bouton ne fonctionne pas, copiez ce lien : ${siteUrl}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">Ceci est un message automatique, merci de ne pas y répondre.</p>
      </div>
    `;
  } else if (type === "forgot") {
    subject = "Réinitialisation de votre mot de passe - Moncef IA";
    html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;padding:24px">
        <h2 style="color:#1A3CFF;margin-top:0">Mot de passe oublié ? 🔑</h2>
        <p>Bonjour,</p>
        <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte Moncef IA.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${siteUrl}" style="display:inline-block;padding:14px 28px;background:#1A3CFF;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">Ceci est un message automatique, merci de ne pas y répondre.</p>
      </div>
    `;
  } else if (type === "verify") {
    subject = "Vérifiez votre compte Moncef IA";
    html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;padding:24px">
        <h2 style="color:#00C9B1;margin-top:0">Bienvenue sur Moncef IA ! ✅</h2>
        <p>Bonjour,</p>
        <p>Merci de vous être inscrit sur Moncef IA. Veuillez confirmer votre adresse e-mail pour activer pleinement votre compte.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${siteUrl}" style="display:inline-block;padding:14px 28px;background:#00C9B1;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
            Vérifier mon compte
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:12px;color:#999">Ceci est un message automatique, merci de ne pas y répondre.</p>
      </div>
    `;
  }

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
        subject: subject,
        html: html,
      }),
    });
    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      const msg = resendData?.message || "Email provider error";
      return json({ error: msg }, resendRes.status, corsHeaders);
    }
    return json({ ok: true, id: resendData?.id || null }, 200, corsHeaders);
  } catch {
    return json({ error: "Failed to send email" }, 502, corsHeaders);
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
