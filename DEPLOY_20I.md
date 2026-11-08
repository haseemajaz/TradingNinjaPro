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

## Local account migration

Saved practice accounts, journal, watchlists and plans belong to the browser origin. Export a JSON backup from the dashboard on the preview domain, then restore it in the matching live/demo mode on your 20i domain. Do not upload personal backups to GitHub or the website document root. Account backups exclude chart drawings and theme. Export and restore native crypto drawings separately for each pair; these are shared by both data modes. Close other app tabs before restoring. Native chart templates have a separate export and restore; disable template autosave first. TradingView drawings and current chart settings are not included.

Use a current HTTPS browser with Web Locks for automatic saving and single-tab account protection. Confirm that a practice position and journal entry survive refresh. Open a second tab and verify that concurrent account writes are blocked.

## GitHub Pages preview

Set Settings → Pages → Source to GitHub Actions. Enable Actions on the fork, then run the **Publish TradingNinjaPro** workflow. It validates types, lint, tests and bundle size before deploying. The workflow also creates a separate root-path 20i website ZIP as a downloadable Actions artifact. A project Pages build uses `/TradingNinjaPro/`; do not upload that subpath build to a root domain without rebuilding.

## Release limitations

This release has no user login, cloud sync or server-side execution. Local persistence is best effort and not tamper-proof. Planner checklists and trade reviews are manual; the separate crypto-only backtester is a simplified historical simulation, not an AI engine or a prediction. The scanner covers six crypto pairs using completed 15-minute, 1-hour, 4-hour or daily candles. Price alerts run only while the app is open and receiving fresh quotes. RSI alerts check completed candles only while the tab is open and visible; they are rate-limited and are not background notifications. The paper engine still uses midpoint fills, 100× leverage and zero commission. Embedded markets remain display-only and may be delayed/unavailable; chart controls do not synchronize changes made inside widgets. Review provider display permissions, privacy and financial disclosures before production publication.
