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

1. **Change the admin passcode** — set it in one go so it works on both the
   server and static hosting:

   ```bash
   python set-passcode.py choose-a-strong-one
   ```

   This updates `admin-secret.json` (server mode, git-ignored) and
   `admin-gate.json` (SHA-256 gate used on static hosts like Vercel — this
   one is committed). To change it manually, edit both files with the same
   passcode.

2. Give the client the admin URL and the passcode.

   The login screen is now required everywhere. On a static host the
   passcode check runs in the browser against `admin-gate.json` — that is a
   casual-access gate, not real security (the hash ships with the site). For
   real protection, use the server mode (VPS) or put `/admin` behind
   authentication.

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
  cards, photo upload, export/import JSON, and GitHub publishing under **Publishing**).
- **`set-passcode.py`** — `python set-passcode.py <new>` keeps the server and
  static-host passcodes in sync.
- **`admin-gate.json`** — SHA-256 passcode gate for the editor on static hosts
  (committed; sync with `set-passcode.py`).

## Static hosting without Python

If the site is hosted somewhere without a server (plain file upload, cPanel,
GitHub Pages, Vercel, etc.) the editor still works:

### Option A — save straight to GitHub (recommended on Vercel)

On hosts that deploy from a GitHub repo, connect the editor to the repo once
(admin → **Publishing** → **Connect GitHub**):

1. Create a GitHub fine-grained token with **Contents: Read and write** on the
   site's repository (github.com → Settings → Developer settings → Fine-grained
   tokens).
2. Enter the repository (`owner/name`), branch, file path and the token, then
   press **Test connection** and **Connect**. The token is stored only in the
   browser.
3. The client now presses **Save changes** as usual — the editor commits the
   new `content.json` to the repo, and the host's auto-deploy makes the change
   go live (Vercel: enable *Git integration* so pushes to the branch
   auto-deploy). Photo uploads go to the repo's `uploads/` folder too.

### Option B — Export / upload

- Open `/admin`, edit the content, press **Export** to download a fresh
  `content.json`, then upload that file next to `index.html` on the host.
- The site itself needs no server — it just reads `content.json` when present.

Photo uploads on a plain static host (no GitHub, no server) need image URLs
instead of uploads.

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
