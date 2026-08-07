#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Set the CMS passcode in one go.

Updates BOTH files so login works the same on the local server
(admin-secret.json) and on static hosts like Vercel (admin-gate.json):

    python set-passcode.py your-new-passcode

Then restart the server if it's running.
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SECRET_FILE = os.path.join(ROOT, "admin-secret.json")
GATE_FILE = os.path.join(ROOT, "admin-gate.json")


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("usage: python set-passcode.py <new-passcode>")
        return 1
    code = sys.argv[1].strip()

    with open(SECRET_FILE, "w", encoding="utf-8") as f:
        json.dump({"passcode": code}, f, indent=2)
        f.write("\n")

    with open(GATE_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {"sha256": hashlib.sha256(code.encode("utf-8")).hexdigest()},
            f,
            indent=2,
        )
        f.write("\n")

    print("Passcode updated in admin-secret.json and admin-gate.json")
    print("Restart the server (if running) so server mode picks it up.")
    print("Commit admin-gate.json so static hosts (Vercel) use the new passcode.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
