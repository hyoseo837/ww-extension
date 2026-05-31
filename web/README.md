# ww-extension web app

The account / profile / payment surface for the WW Extension, as a Vite +
React + TypeScript SPA (ADR 0019). It is an independent client of the same
FastAPI backend the extension uses (ADR 0021) and deploys to Vercel at
`ww-extension.hyoseo.dev` (ADR 0022). It is **not** part of the Chrome Web
Store bundle (ADR 0020 — excluded by the `package.sh` allowlist).

## Local dev

```bash
cp .env.example .env   # fill in the values (see below)
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check + static build to dist/
```

## Environment (`web/.env`)

All values are **public by design** — they ship in the SPA bundle. Never put
a secret key in a `VITE_` variable.

| Var | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (same project as the backend) |
| `VITE_SUPABASE_ANON_KEY` | Supabase **publishable** (anon) key |
| `VITE_API_BASE_URL` | Backend base URL (`http://localhost:8000` for local dev) |

## One-time external setup (operator)

1. **Vercel** — new project pointed at this repo's `web/` directory
   (build `npm run build`, output `dist`). Set the three `VITE_` env vars.
2. **Cloudflare DNS** — `CNAME ww-extension → <vercel target>`, set
   **DNS-only (grey cloud)** so Cloudflare doesn't double-proxy Vercel's TLS.
3. **Supabase Auth → URL Configuration → Redirect URLs** — add
   `https://ww-extension.hyoseo.dev` and `http://localhost:5173`. If Supabase
   uses your own Google OAuth credentials, mirror the authorized origins /
   redirect URIs in the Google Cloud console.
4. **Backend CORS** — set `CORS_ORIGINS` on the DigitalOcean app to include
   `https://ww-extension.hyoseo.dev` (see `server/.env.example`).

Vercel preview deployments get rotating URLs that aren't in the CORS / redirect
allowlists, so auth/API won't work on previews by default — exercise auth on
production.
