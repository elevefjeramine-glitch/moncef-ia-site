export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { type, email, data } = await request.json();
      let subject = "";
      let body = "";

      if (type === "forgot") {
        subject = "Récupération de mot de passe - Moncef IA";
        body = `
          <div style="font-family: sans-serif; padding: 20px; background: #060b1a; color: #fff; border-radius: 10px;">
            <h2 style="color: #00C9B1;">🎓 Moncef IA</h2>
            <p>Bonjour,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <div style="background: rgba(26,60,255,0.1); padding: 15px; border-radius: 8px; border: 1px solid #1A3CFF; margin: 20px 0;">
              <p style="margin: 0;">Votre code de vérification est : <strong style="font-size: 24px; color: #00C9B1;">${data.otp}</strong></p>
            </div>
            <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
            <p style="font-size: 12px; color: rgba(255,255,255,0.5);">© 2026 Moncef IA | Fondateur: Amine FJER</p>
          </div>
        `;
      } else if (type === "invite") {
        subject = `${data.senderName} vous invite sur Moncef IA !`;
        body = `
          <div style="font-family: sans-serif; padding: 20px; background: #060b1a; color: #fff; border-radius: 10px;">
            <h2 style="color: #00C9B1;">🎓 Moncef IA</h2>
            <p>Bonjour !</p>
            <p><strong>${data.senderName}</strong> vous invite à rejoindre la communauté Moncef IA, la plateforme éducative intelligente.</p>
            <p>En rejoignant via cette invitation, vous recevrez un bonus permanent de <strong>+200 tokens</strong> !</p>
            <a href="https://elevefjeramine-glitch.github.io/moncef-ia-site/" style="display: inline-block; background: #1A3CFF; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0;">Rejoindre maintenant ➜</a>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
            <p style="font-size: 12px; color: rgba(255,255,255,0.5);">© 2026 Moncef IA | Fondateur: Amine FJER</p>
          </div>
        `;
      }

      // Note: L'envoi réel nécessite une intégration avec un service comme MailChannels (gratuit sur Workers) ou Resend.
      // Voici un exemple avec MailChannels :
      const send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email }] }],
          from: { email: "no-reply@moncef-ia-platform.designarena.ai", name: "Moncef IA" },
          subject: subject,
          content: [{ type: "text/html", value: body }],
        }),
      });

      const res = await fetch(send_request);
      
      return new Response(JSON.stringify({ success: res.ok }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
