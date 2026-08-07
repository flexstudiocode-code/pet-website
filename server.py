#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================================
 Paw & Glow — Local web server + client content API
============================================================================
Drop-in replacement for `python -m http.server` that also powers the
client CMS (admin.html). Run:

    python server.py [port]        (default port 8766)

Endpoints
---------
  GET  /                  the website (static files)
  GET  /api/config        current content.json
  POST /api/verify        {"passcode": "..."} -> 200 / 401
  POST /api/config        {"passcode": "...", "content": {...}} -> saves content.json
  POST /api/upload?name=photo.jpg   raw image bytes -> {"url": "/uploads/..."}

Passcode
--------
Stored in admin-secret.json (created automatically on first run with the
default "pawandglow"). CHANGE IT before handing the site to a client:

    {"passcode": "your-own-secret"}

Security note: the passcode is sent over HTTP. Use this behind the
Cloudflare tunnel for demo purposes, or put it behind HTTPS/authentication
for anything production-like.

Only Python 3 stdlib — no dependencies.
============================================================================
"""

import json
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT_FILE = os.path.join(ROOT, "content.json")
SECRET_FILE = os.path.join(ROOT, "admin-secret.json")
UPLOAD_DIR = os.path.join(ROOT, "uploads")

DEFAULT_PASSCODE = "pawandglow"
MAX_JSON_BODY = 2 * 1024 * 1024      # 2 MB for content saves
MAX_UPLOAD = 8 * 1024 * 1024         # 8 MB for image uploads
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
START_TIME = time.time()


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

def load_secret():
    """Return the admin passcode, creating admin-secret.json if missing."""
    try:
        with open(SECRET_FILE, encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data.get("passcode"), str) and data["passcode"]:
                return data["passcode"]
    except Exception:
        pass
    with open(SECRET_FILE, "w", encoding="utf-8") as f:
        json.dump({"passcode": DEFAULT_PASSCODE}, f, indent=2)
        f.write("\n")
    print("  [cms] admin-secret.json created — default passcode is '%s'"
          % DEFAULT_PASSCODE)
    print("        CHANGE IT before handing the site to a client!")
    return DEFAULT_PASSCODE


def load_content():
    try:
        with open(CONTENT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_content(data):
    tmp = CONTENT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, CONTENT_FILE)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def send_json(handler, status, obj):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler, limit):
    try:
        length = int(handler.headers.get("Content-Length", 0))
    except (TypeError, ValueError):
        length = 0
    if length <= 0 or length > limit:
        return None
    return handler.rfile.read(length)


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def end_headers(self):
        """Content changes on disk all the time (CMS), so always revalidate."""
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    # -- GET ---------------------------------------------------------------

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/config":
            data = load_content()
            if data is None:
                send_json(self, 404, {"error": "content.json not found"})
            else:
                send_json(self, 200, data)
            return
        if path == "/health":
            send_json(self, 200, {
                "ok": True,
                "service": "paw-and-glow",
                "uptimeSeconds": int(time.time() - START_TIME)
            })
            return
        super().do_GET()

    # -- POST --------------------------------------------------------------

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/verify":
            return self.api_verify()
        if path == "/api/config":
            return self.api_save()
        if path == "/api/upload":
            return self.api_upload()
        self.send_error(404, "Unknown API endpoint")

    def api_verify(self):
        body = read_body(self, MAX_JSON_BODY)
        if body is None:
            return send_json(self, 400, {"error": "empty or oversized body"})
        try:
            payload = json.loads(body.decode("utf-8"))
        except ValueError:
            return send_json(self, 400, {"error": "invalid JSON"})
        if payload.get("passcode") == load_secret():
            return send_json(self, 200, {"ok": True})
        return send_json(self, 401, {"error": "wrong passcode"})

    def api_save(self):
        body = read_body(self, MAX_JSON_BODY)
        if body is None:
            return send_json(self, 400, {"error": "empty or oversized body"})
        try:
            payload = json.loads(body.decode("utf-8"))
        except ValueError:
            return send_json(self, 400, {"error": "invalid JSON"})

        if payload.get("passcode") != load_secret():
            return send_json(self, 401, {"error": "wrong passcode"})

        content = payload.get("content")
        if not isinstance(content, dict):
            return send_json(self, 400, {"error": "content must be an object"})

        content["_meta"] = {
            "version": 1,
            "lastEdited": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        save_content(content)
        return send_json(self, 200, {"ok": True})

    def api_upload(self):
        query = parse_qs(urlparse(self.path).query)
        if (query.get("passcode") or [""])[0] != load_secret():
            return send_json(self, 401, {"error": "wrong passcode"})
        name = (query.get("name") or [""])[0]
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_EXT:
            return send_json(self, 400, {
                "error": "allowed types: " + ", ".join(sorted(ALLOWED_EXT))
            })

        body = read_body(self, MAX_UPLOAD)
        if not body:
            return send_json(self, 400, {"error": "empty or oversized upload"})

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        base = os.path.splitext(os.path.basename(name))[0]
        base = "".join(c for c in base if c.isalnum() or c in "-_")[:40] or "photo"
        fname = "%d_%s%s" % (int(time.time()), base, ext)
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
            f.write(body)

        return send_json(self, 200, {"url": "/uploads/" + fname})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 60)
    print(" Paw & Glow server running")
    print("   Site    : http://127.0.0.1:%d/" % port)
    print("   Admin   : http://127.0.0.1:%d/admin.html" % port)
    print("   API     : /api/config  /api/verify  /api/upload")
    print("   Passcode: %s (see admin-secret.json)" % load_secret())
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
