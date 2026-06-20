/**
 * Moncef IA - Improved Worker Backend
 * Features: SPA support, Claude API Proxy, Rate Limiting, Email Notifications
 */

const ALLOWED_ORIGINS = new Set([
  "https://elevefjeramine-glitch.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20; // Increased limit
const ipBuckets = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "null";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };

    // Handle Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health Check
    if (url.pathname === "/health") {
      return json({ status: "ok", version: "1.1.0" }, 200, corsHeaders);
    }

    // Rate Limiting Check
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!checkRateLimit(ip)) {
      return json({ error: "Too many requests. Please try again in a minute." }, 429, corsHeaders);
    }

    // Routing
    try {
      if (url.pathname === "/api/claude" && request.method === "POST") {
        return handleClaude(request, env, corsHeaders);
      }
      
      if (url.pathname === "/api/invite" && request.method === "POST") {
        return handleEmailAction(request, env, corsHeaders, "invite");
      }
      
      if (url.pathname === "/api/forgot-password" && request.method === "POST") {
        return handleEmailAction(request, env, corsHeaders, "forgot");
      }

      if (url.pathname === "/api/verify-account" && request.method === "POST") {
        return handleEmailAction(request, env, corsHeaders, "verify");
      }

      return json({ error: "Endpoint not found", path: url.pathname }, 404, corsHeaders);
    } catch (err) {
      console.error("Worker Error:", err);
      return json({ error: "Internal Server Error", message: err.message }, 500, corsHeaders);
    }
  },
};

async function handleClaude(request, env, corsHeaders) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Claude API not configured on server" }, 500, corsHeaders);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const { model = "claude-3-haiku-20240307", max_tokens = 1024, system = "", messages } = payload;
  
  if (!Array.isArray(messages)) {
    return json({ error: "Messages must be an array" }, 400, corsHeaders);
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await response.json();
    if (!response.ok) {
      return json({ error: data.error?.message || "Anthropic API Error" }, response.status, corsHeaders);
    }

    return json({ 
      reply: data.content?.[0]?.text || "No response",
      usage: data.usage 
    }, 200, corsHeaders);
  } catch (err) {
    return json({ error: "Failed to connect to Claude API" }, 502, corsHeaders);
  }
}

async function handleEmailAction(request, env, corsHeaders, type) {
  if (!env.RESEND_API_KEY || !env.INVITE_FROM_EMAIL) {
    return json({ error: "Email service not configured" }, 503, corsHeaders);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const email = String(payload.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email address" }, 400, corsHeaders);
  }

  const siteUrl = "https://elevefjeramine-glitch.github.io/moncef-ia-site/";
  let subject = "";
  let html = "";

  if (type === "invite") {
    subject = "🎓 Invitation à rejoindre Moncef IA";
    html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #1A3CFF; text-align: center;">Bienvenue sur Moncef IA</h2>
        <p>Bonjour,</p>
        <p>Vous avez été invité à rejoindre <strong>Moncef IA</strong>, la plateforme éducative de nouvelle génération.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${siteUrl}" style="background-color: #1A3CFF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Créer mon compte</a>
        </div>
        <p style="font-size: 12px; color: #666;">Si le bouton ne fonctionne pas, copiez ce lien : ${siteUrl}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">© 2026 Moncef IA - Éducation Intelligente</p>
      </div>
    `;
  } else if (type === "forgot") {
    subject = "🔑 Réinitialisation de mot de passe - Moncef IA";
    html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1A3CFF;">Mot de passe oublié ?</h2>
        <p>Nous avons reçu une demande de réinitialisation pour votre compte Moncef IA.</p>
        <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
        <div style="margin: 25px 0;">
          <a href="${siteUrl}#settings" style="background-color: #1A3CFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a>
        </div>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      </div>
    `;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.INVITE_FROM_EMAIL,
        to: [email],
        subject,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data.message || "Email error" }, res.status, corsHeaders);

    return json({ success: true, id: data.id }, 200, corsHeaders);
  } catch (err) {
    return json({ error: "Failed to send email" }, 502, corsHeaders);
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  bucket.count++;
  return true;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
