# Paw & Glow — Website + Client CMS

A static pet-grooming website with a built-in content manager so the client can
edit their own site — no developer needed.

## Quick start

```bash
python server.py          # serves the site + CMS on http://127.0.0.1:8766
```

Or double-click `start-tunnel.bat` to also get a public Cloudflare link.

| What                  | URL                          |
| --------------------- | ---------------------------- |
| Website               | `http://localhost:8766/`     |
| Client editor (CMS)   | `http://localhost:8766/admin` |

## Going live (free, always-on, automatic admin saves)

To run the site on a free VPS (Oracle Always Free) with HTTPS and instant
admin saves, follow **`DEPLOYMENT.md`** — it includes a one-command
installer in `deploy/` (`setup_server.sh`, systemd unit, keep-alive cron).

## Handing the site to a client

1. **Change the admin passcode** — edit `admin-secret.json`:

   ```json
   { "passcode": "choose-a-strong-one" }
   ```

   (The file is created automatically on first run with the default
   `pawandglow`. It is git-ignored and never sent to the browser.)

2. Give the client the admin URL and the passcode.

3. The client edits text, prices, photos, hours, services and reviews in the
   editor, presses **Save changes**, and the live site updates instantly.

## How it works

- **`content.json`** — the single source of truth for every editable field.
  The site reads it on every page load (`js/main.js`). If the file is missing
  the site simply shows the built-in defaults, so the HTML is always a valid
  fallback (and good for SEO).
- **`server.py`** — Python 3 stdlib only, no dependencies. Drop-in replacement
  for `python -m http.server`. Sends `Cache-Control: no-cache` so content
  edits always show up, and adds three endpoints:
  - `POST /api/verify` — passcode check for the login screen
  - `POST /api/config` — save `content.json` (passcode required)
  - `POST /api/upload` — photo uploads, saved to `uploads/`
- **`admin/index.html`** — the client editor at `/admin` (login, sections, add/remove/reorder
  cards, photo upload, export/import JSON).

## Static hosting without Python

If the site is hosted somewhere without a server (plain file upload, cPanel,
GitHub Pages, etc.) the editor still works in a reduced mode:

- Open `/admin`, edit the content, press **Export** to download a fresh
  `content.json`, then upload that file next to `index.html` on the host.
- The site itself needs no server — it just reads `content.json` when present.

Photo uploads need the server; on static hosting, use image URLs instead.

## Security notes

- The passcode travels over HTTP — fine for the demo tunnel, but use HTTPS
  (e.g. Cloudflare) or put the server behind authentication for production.
- Google indexes the site, not the editor at `/admin` (it carries `noindex`).

## Files

```
index.html        the website
css/styles.css    website styles
js/config.js      developer settings (name, WhatsApp, demo tier)
js/main.js        website behaviour + reads content.json
content.json      editable content (written by the CMS)
admin/index.html  client editor (served at /admin)
css/admin.css     editor styles
js/admin.js       editor logic
server.py         local server + content API
admin-secret.json admin passcode (git-ignored)
uploads/          uploaded photos (git-ignored)
```

> Tip: `index.html` loads `js/main.js?v=2`. If you ever ship a change to
> `main.js`, bump that version number so returning visitors don't get a
> cached copy.
