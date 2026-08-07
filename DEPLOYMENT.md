# Deploying Paw & Glow — free, always-on, with live CMS edits

This guide puts the site on a **free, always-on server** (Oracle Cloud's
"Always Free" VPS) behind **Cloudflare** for HTTPS, so the client's admin
edits go live automatically — no more running it from your laptop.

## The stack (all free)

| Piece            | What it is                                      | Cost |
| ---------------- | ----------------------------------------------- | ---- |
| Server           | Oracle Cloud Always Free VPS (Ubuntu)           | $0   |
| Server code      | `server.py` + the `deploy/` kit (in this repo)  | $0   |
| HTTPS + DNS      | Cloudflare free plan (proxy / tunnel)           | $0   |
| Domain name      | The client's own domain (e.g. `theirbusiness.com`) | ~$8–12/yr — the **only** recurring cost |

If the client already owns a domain (or is buying one as part of your
package), everything else is permanently free.

> **Two honest caveats about Oracle free VPS:**
> 1. Signup requires a normal credit/debit card for identity verification
>    (no charge). Their fraud filter is strict — use a real bank card, not a
>    prepaid or virtual one.
> 2. Oracle reclaims instances left *idle* for 7 straight days (95th-percentile
>    CPU + network below 20%). The installer adds a real keepalive (hourly
>    activity + weekly backups) to prevent this — see Part 6.

---

## Part 1 — Create the Oracle VPS (≈15 min)

1. Go to **signup.oraclecloud.com** and create an account (card required for
   verification; choose the **Always Free** account type if offered, or
   Pay-As-You-Go — free resources stay free on both).
2. **Generate an SSH key** on your computer (Git Bash / Linux / macOS):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/oracle_key -N ""
   ```

3. In the Oracle console: **Compute → Instances → Create instance**:
   - Name: `paw-and-glow`
   - Image: **Ubuntu 24.04 LTS** (or 22.04)
   - Shape: **VM.Standard.A1.Flex** (the free ARM shape) — 2 OCPUs / 12 GB RAM.
     If you get "out of host capacity", try the **VM.Standard.E2.1.Micro**
     (free x86) shape or a different availability domain.
   - **Add SSH key**: paste the contents of `~/.ssh/oracle_key.pub`
   - Create. Wait for it to show a public IP.
4. **Log in** (the default user is `ubuntu`):

   ```bash
   ssh -i ~/.ssh/oracle_key ubuntu@<PUBLIC_IP>
   ```

---

## Part 2 — Install the site (one command)

On the VPS:

```bash
# 1. Python (Ubuntu usually has it)
sudo apt-get update && sudo apt-get install -y python3

# 2. Get the site files onto the server. Easiest options:
#    a) upload from your PC (run from this repo folder on your machine):#       scp -i ~/.ssh/oracle_key -r index.html admin content.json server.py css js deploy ubuntu@<PUBLIC_IP>:~/
#       b) or zip it up and upload:  zip -r site.zip . -x "deploy" && scp ... && unzip site.zip
```

Then, inside the folder on the VPS:

```bash
sudo bash deploy/setup_server.sh 8766
```

That installs everything to `/opt/pawandglow`, creates a dedicated user,
registers a **systemd service** (auto-start on boot, auto-restart on crash),
and installs the **keep-alive cron**. At the end it prints the service status
and next steps.

Verify it's up:

```bash
curl http://127.0.0.1:8766/health
# {"ok": true, "service": "paw-and-glow", "uptimeSeconds": ...}
```

---

## Part 3 — Set the client passcode

```bash
sudo nano /opt/pawandglow/admin-secret.json
```

Set a strong passcode (e.g. `{"passcode": "pick-a-long-secret"}`). The change
takes effect immediately — no restart needed. Give the client the admin URL
and this passcode.

---

## Part 4 — Connect the domain + HTTPS

### Recommended: Cloudflare Tunnel (no open ports, HTTPS automatic)

1. **Add the client's domain to Cloudflare** (free plan) and change the
   registrar's nameservers to Cloudflare's. Wait for "Active".
2. Go to **Cloudflare Zero Trust** (one.zero.trust) → **Networks → Tunnels →
   Create a tunnel** → type *Cloudflared* → name it → copy the **token**.
3. On the VPS, install and run the tunnel as a service:

   ```bash
   # install cloudflared
   sudo mkdir -p --mode=0755 /usr/share/keyrings
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt-get update && sudo apt-get install -y cloudflared

   # attach the tunnel (paste YOUR token)
   sudo cloudflared service install <TOKEN>
   ```

4. Back in Zero Trust, open the tunnel → **Public Hostname → Add**:
   - Subdomain/domain: the client's domain (and add `www` too)
   - Service type: **HTTP**, URL: `localhost:8766`

   Cloudflare handles HTTPS end-to-end automatically. No firewall changes, no
   open ports.

5. Test: `https://yourdomain.com/health` from any browser.

### Alternative: direct DNS (only if you don't want the tunnel)

Cloudflare's proxy only forwards its standard port list, so for a direct
connection the app must listen on port **80** — reinstall with
`sudo bash deploy/setup_server.sh 80`, open port 80 in the VCN security list,
then set the domain's **A record** (orange-cloud / proxied) to the VPS IP and
choose SSL mode **Flexible** in Cloudflare.

---

## Part 5 — Verify the whole loop

1. `https://yourdomain.com/` — the site loads over HTTPS.
2. `https://yourdomain.com/health` — `{"ok": true, ...}`.
3. `https://yourdomain.com/admin` — the login screen appears.
4. Log in, change something (e.g. the tagline), press **Save changes**.
5. Reload the public site — the change is live. That's the client's entire
   workflow from now on.

---

## Part 6 — Keep it alive & back up

Oracle reclaims free instances that look *idle*: **95th-percentile CPU,
network and memory all under 20% for 7 straight days**. The installer
handles this two ways — a keepalive (prevents idle) and a backup (recovers
if the worst ever happens).

### The keepalive (installed automatically, hourly)

A light HTTP ping every few hours is **not** enough — the metric is a
*percentile*, so a handful of tiny requests barely moves it. The installed
`/opt/pawandglow/keepalive.sh` therefore does two things each hour:

1. Requests the live site's `/health` (real public traffic)
2. Burns ~1 CPU core doing SHA-256 hashing for 5 minutes (≈96 min of CPU
   per day — safely above the idle threshold)

Point it at the real domain once the site is live:

```bash
sudo sed -i 's#YOUR-DOMAIN.com#yourdomain.com#' /opt/pawandglow/keepalive.sh
```

Tuning (edit the top of the script): `KEEPALIVE_MINUTES` per run, or
`KEEPALIVE_URL`. If you'd rather rely purely on client traffic, comment out
its cron line (`crontab -e`). Organic visits + admin edits add activity on
top of the keepalive, so a real business site is doubly safe.

### The backup (installed automatically, weekly)

The only data that changes is `content.json` and the `uploads/` folder.
Every Sunday the installer's cron makes a tarball:

```cron
0 3 * * 0 mkdir -p /root/pawandglow-backups && tar czf /root/pawandglow-backups/pawandglow-$(date +\%F).tgz -C /opt/pawandglow content.json uploads && find /root/pawandglow-backups -name '*.tgz' -mtime +60 -delete
```

(It lives in root's own crontab — per-user format, no user column.)

**Download those tarballs regularly** — the VPS is free, not indestructible:

```bash
scp -i ~/.ssh/oracle_key root@<PUBLIC_IP>:/root/pawandglow-backups/*.tgz .
```

If the instance were ever lost, restore in minutes: fresh VPS → re-run the
installer → drop the tarball's `content.json` and `uploads/` back into
`/opt/pawandglow/`.

---

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| Oracle signup rejected | Try a different bank card / browser / network. If it won't work, use the GCP fallback below. |
| "Out of host capacity" creating the instance | Retry in a few hours, pick another availability domain, or use the free E2.1.Micro x86 shape. |
| Site not reachable | `systemctl status pawandglow` and `journalctl -u pawandglow -n 50` on the VPS. |
| Tunnel down | `sudo systemctl status cloudflared`; re-run `sudo cloudflared service install <TOKEN>`. |
| `curl /health` works but domain doesn't | DNS not propagated or tunnel hostname not added. Check the Zero Trust route. |
| Client's edits don't appear | They edited but didn't press **Save changes**; or they're on a cached tab — hard-refresh. |

---

## Alternative: Google Cloud free VPS (if Oracle signup fails)

- **GCP Always Free** `e2-micro` VM (us-west1 / us-central1 / us-east1) is
  also free forever and always-on. Same install steps (Part 2–4).
- **Caveat:** only **1 GB/month** of free internet egress. The site's photos
  are hotlinked from Unsplash, so only page loads + client uploads count —
  fine for a typical small-business site, but keep it in mind if the client
  uploads lots of photos.

---

## Security checklist (before handover)

- [ ] Passcode changed from the default (`/opt/pawandglow/admin-secret.json`)
- [ ] Admin URL + passcode given to the client (they should keep it private)
- [ ] HTTPS confirmed (Cloudflare tunnel does this automatically)
- [ ] No public port open except SSH (22); restrict SSH to your IP if possible
- [ ] `sudo apt-get update && sudo apt-get upgrade` on the VPS
- [ ] Backups running (Part 6)

The editor at `/admin` is already `noindex`, so Google won't index it.
