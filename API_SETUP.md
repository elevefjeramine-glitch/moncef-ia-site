## Secure Claude API setup

Your website is static on GitHub Pages, so API keys must stay on a backend.

This project includes a Cloudflare Worker proxy in `worker/`.

### 1) Deploy the Worker

Run these commands in `worker/`:

```powershell
npm install -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

When `wrangler deploy` finishes, it prints a URL like:

`https://moncef-ia-proxy.<subdomain>.workers.dev`

### 2) Connect frontend

In `index.html`, set:

```js
const API_PROXY_URL = 'https://moncef-ia-proxy.<subdomain>.workers.dev/api/claude';
```

### 3) Push website update

```powershell
git add .
git commit -m "Connect frontend to secure Claude proxy"
git push
```

After this, your live GitHub Pages website can call Claude securely.
