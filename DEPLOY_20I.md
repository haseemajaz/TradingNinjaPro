# Deploy TradingNinjaPro on 20i

## What this release needs

A standard HTTPS website hosting package capable of serving HTML, JavaScript and CSS. No running Node.js server, database or exchange key is required. Build locally or in CI; do not upload `node_modules` or run a development server on shared hosting.

## Build for your domain

1. Use Node.js 20+ and run `npm ci` then `npm run build`.
2. Back up the existing website and its `.htaccess` before replacing anything.
3. In the chosen 20i package, open File Manager (or use SFTP).
4. Upload the **contents** of `dist/` to the domain's configured document root (usually `public_html`). Do not upload a containing `dist` folder.
5. Extract files if using the compiled ZIP. Ensure `index.html`, `assets/`, `brand.svg`, and `manifest.json` are together in the document root.
6. Enable SSL/HTTPS, redirect HTTP using the hosting control panel, and clear the CDN/site cache.
7. Open the real domain in a private browser and run the launch checks below.

For a subdirectory such as `/terminal/`, build with `BASE_PATH=/terminal/ npm run build` and upload there. This app does not require SPA rewrite rules because navigation is client state, not nested URL routes. Preserve any existing WordPress rules; use a separate subdomain/package if unsure.

## Launch checks

- Brand, logo and favicon show correctly; no missing JS/CSS requests.
- Live crypto loads historical candles and updates quotes in an allowed region. Never label demo replay as live.
- Disconnect the network: status changes and new paper orders/manual closes fail until fresh quotes return.
- Forex, gold, silver and each stock load after opting into the third-party chart. Verify each symbol, provider, delay and market-session status; unavailable symbols must not be advertised as live.
- Risk calculator, keyboard focus, mobile layout, CSV export and theme toggle work.
- Licence notices and TradingView attribution remain visible.
- Review your privacy/cookie policy, financial disclosures and market-data display permissions for the intended audience. External widgets contact third parties.
- Confirm backups and rollback. Never upload passwords, personal access tokens, `.git`, or private `.env` files.

## Rollback

Keep the previous deployment ZIP. Replace the new static files with that backup and purge the CDN cache. Retain old hashed assets briefly if possible so already-open tabs are less likely to request missing chunks.

## Release limitations

v0.1 has no login, no cloud storage and no server-side trade execution. Practice account state resets on refresh; export closed trades first. The upstream account-scoped journal is not durable across new account IDs. Paper fills and risk estimates are simulations, not broker quotes or investment advice. Verify live provider availability and terms before publishing.
