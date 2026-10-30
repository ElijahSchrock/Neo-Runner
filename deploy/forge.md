# Put Neo Runner on your Forge server

Your server is already connected to Forge. Add the DNS record now so it can
start updating while we create the site and configure the app.

## Do this first: point the subdomain at your server

1. Copy your server's **public IPv4 address** from Forge's server overview or the
   DigitalOcean Droplet page. Use the server IP, not a Spaces bucket address.
2. Open the DNS settings for **elijahschrock.com** at the provider that manages
   its nameservers. This might be your registrar, Cloudflare, or DigitalOcean;
   hosting the server on DigitalOcean does not automatically mean DNS is there.
   If DNS is on DigitalOcean: **Networking → Domains → elijahschrock.com**.
3. Add this record:

   | Field | Value |
   | --- | --- |
   | Type | `A` |
   | Name / Host | `neorunner` |
   | Value / Points to | Your server's public IPv4 address |
   | TTL | `300` seconds (5 minutes), or the lowest available |
   | Proxy status (Cloudflare only) | DNS only during setup |

   Most providers append `elijahschrock.com` to the host automatically. If your
   provider requires the full name, enter `neorunner.elijahschrock.com` instead.
   If that exact hostname already has an A record, edit it rather than adding a
   second IP. If it has a CNAME, replace that record with the A record. Keep the
   root domain (`@`) and other subdomains unchanged.
4. Save. Continue the Forge setup immediately; the game does not need to be
   deployed for DNS to start updating.

Check from your Mac's terminal:

```sh
dig +short A neorunner.elijahschrock.com @1.1.1.1
dig +short A neorunner.elijahschrock.com @8.8.8.8
```

Both should eventually show your server IP. A low TTL helps future updates,
but existing cached answers can last for their previous TTL; five minutes is
not a guaranteed completion time. The website may show an error until the
Forge site and app are ready.

Source: [DigitalOcean DNS record instructions and TTL guidance](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/).

## Next: create the site in Forge

Open your server in Forge and choose **New site / Create site**.

| Setting | Value |
| --- | --- |
| Application / site type | Static HTML (under Other if grouped there) |
| Repository | The Git repository containing Neo Runner |
| Branch | The branch you intend to deploy |
| Web directory (Advanced settings) | `/dist` |
| Push to deploy | Off during setup |
| Zero downtime deployments (if offered) | Off for this guide |
| Install Composer dependencies (if offered) | Off |

Choose the repository during creation. Current Forge does not let you attach a
repository afterward to a site created without one.

If Forge gives the site an `on-forge.com` address, keep it for now. We will add
`neorunner.elijahschrock.com` after the app is running. If a custom domain field
is offered during creation, use `neorunner.elijahschrock.com`.

Create the site. It is normal for it not to show the game yet: `/dist` is created
when we run the build. The local project changes must also be committed and
pushed before Forge can deploy them.

**Next checkpoint:** note the site directory and Unix user shown by Forge.
Those determine the paths used in the server commands below.

Source: [Forge site creation documentation](https://laravel.com/forge/docs/sites/the-basics).

## What comes afterward

1. **SSH:** check Node 24 and create the database configuration file.
2. **Forge:** build the game and add a background process to keep its API running.
3. **Forge:** add the custom domain and enable HTTPS after DNS points to the server.

SQLite creates the leaderboard database automatically. You do not need to create
a database in Forge's Databases section. The included assets work initially;
Spaces can be connected later.

<details>
<summary>Full server configuration — use after the site is created</summary>


This is a Node app, not a Laravel app. Forge can manage Node processes behind
Nginx ([Laravel's deployment example](https://blog.laravel.com/deploying-your-nextjs-app-to-forge)).
Use one app process and a persistent local SQLite file. The app initializes its
schema automatically; no database service or database credentials are required.

These examples assume the site runs as `forge` at
`/home/forge/neorunner.elijahschrock.com`. Substitute the actual site user and
path if Forge site isolation is enabled. This guide assumes regular in-place
deployments, not release directories or zero-downtime deployment symlinks.

## Initial server setup

1. Complete the DNS step at the top of this guide. Only add AAAA if IPv6 is
   configured on that server.
2. Create the site using the settings above. The `/dist` web directory ensures
   Nginx only exposes the production build. Use the actual site directory and
   Unix user shown in Forge for every path below.
3. Ensure Node 24 is available to both the deployment user and the daemon. Run
   `node --version` and `command -v node` over SSH. Use that absolute Node binary
   path for the daemon; `/usr/bin/node` below is an example.
4. As the site's Unix user, create directories outside the checkout:

   ```sh
   mkdir -p /home/forge/.config /home/forge/.local/share/neorunner
   chmod 700 /home/forge/.local/share/neorunner
   ```

5. Create `/home/forge/.config/neorunner.env` containing:

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3101
   DATABASE_PATH=/home/forge/.local/share/neorunner/leaderboard.sqlite
   ```

   The site user must own this file and the database directory. Port 3101 must
   be unused. Do not expose it through the firewall; Nginx reaches it locally.
   This file stays outside git and survives deployments.
6. Set the Forge deployment script to:

   ```sh
   set -eu
   cd /home/forge/neorunner.elijahschrock.com
   git pull --ff-only
   npm ci --include=dev
   npm test
   npm run build
   ```

   Run the first deployment before starting the daemon. Vite is needed at build
   time, so retain `--include=dev` even when NODE_ENV is production. Tests use a
   temporary database, not production scores.
7. Add a Forge background process / daemon with **one process**, running as the
   site user, in `/home/forge/neorunner.elijahschrock.com`, with command:

   ```sh
   /usr/bin/node --env-file=/home/forge/.config/neorunner.env /home/forge/neorunner.elijahschrock.com/server.mjs
   ```

   Enable automatic restart. Use SIGTERM for stopping, with at least a 10-second
   stop timeout. After later deployments, restart this specific daemon through
   Forge to load backend changes. Don't restart every daemon on the server.

## Nginx and HTTPS

In the site's Nginx configuration, retain Forge's existing server, SSL,
certificate, and include directives. Ensure `root` points to the site's `dist`
directory. Replace the existing `location /` and add the API location below;
do not add a second `location /`. Remove any PHP routing for this static site.

```nginx
location / {
    try_files $uri $uri/ =404;
}

location /api/ {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 15s;
}
```

The proxy preserves `/api/` in the URL. It overwrites forwarded IPs so the API's
per-IP submission limit works behind local Nginx. If you later put a CDN in
front of Nginx, configure trusted real client IPs there before changing limits.

Have Forge validate and reload Nginx, then request a Let's Encrypt certificate
for the domain and enable HTTPS redirection. Verify:

```sh
curl --fail https://neorunner.elijahschrock.com/api/health
curl --fail https://neorunner.elijahschrock.com/api/leaderboard
```

Expect `{"status":"ok"}` and a JSON array. Play a game, then check its score in
another browser. A 502 usually means the daemon isn't running or the port differs;
check the Forge daemon log and Node binary version.

## Assets and backups

Local assets deploy with `dist/`. To switch to Spaces, set
`VITE_ASSET_BASE_URL` in the build environment or the checkout's `.env.local`,
then rebuild. This is a public URL, never an access key. Spaces must allow
public reads and CORS for `https://neorunner.elijahschrock.com`.

Back up the SQLite database separately from deployments. With the `sqlite3`
CLI installed, its backup command safely snapshots a live database:

```sh
sqlite3 /home/forge/.local/share/neorunner/leaderboard.sqlite ".backup '/your-backup-directory/neorunner.sqlite'"
```

Use a real backup directory with restricted permissions, schedule snapshots,
keep copies off the server, and test restoration. Do not copy only the main
SQLite file while the app is running in WAL mode. To restore a snapshot, stop
this app's daemon, preserve the existing database and WAL/SHM files together,
restore into a clean database path owned by the site user, then restart.

Scores are client-submitted and player names aren't authenticated. Validation
and submission limits provide basic safeguards, not cheat prevention. This
setup targets a casual game on one server; multiple app servers would call for
a shared database such as PostgreSQL.

</details>
