# Deployment

BugInbox runs on a single EC2 instance as five containers, behind a Caddy
instance that is already there. GitHub Actions builds the images, pushes them
to GHCR, and SSHes in to pull and restart. Nothing is built on the instance.

This is deliberately a small, manual-friendly setup. Every command the
pipeline runs on the server is one you can run yourself, in the same order.

**Caddy is not part of this project.** Nothing here installs, configures,
starts, stops, restarts or reloads it, and no step writes to `/etc/caddy`. The
stack only attaches its `web` container to the Docker network Caddy is already
on. `infra/caddy/buginbox.Caddyfile` is a reference copy for you to install by
hand.

## Shape

```
internet ──▶ Caddy (yours, TLS) ──▶ web (nginx) ──▶ api (Fastify) ──▶ postgres
                 shared network        │                │              redis
                                       │                └──────────────▶ SMTP
                                       └─ site, dashboard, widget bundle
                                                         worker ──▶ notification email
```

One upstream. The dashboard is built with origin-relative URLs, and the `web`
container serves the site, the SPA and `/widget/v1/buginbox.js` while proxying
`/api/` to the API. No second hostname, no CORS to arrange.

| File | What it does |
| --- | --- |
| `Dockerfile` | Unchanged. Already builds both production images (`server`, `web`). |
| `docker-compose.prod.yml` | The five containers. Pulls images; builds nothing. |
| `.env.production.example` | Template for `/opt/buginbox/.env`. Placeholders only. |
| `infra/nginx/prod.conf.template` | `default.conf` plus real-client-IP recovery behind Caddy. |
| `infra/caddy/buginbox.Caddyfile` | Passive reference. Never copied or applied by anything here. |
| `.github/workflows/ci.yml` | Lint, typecheck, build, tests. |
| `.github/workflows/cd.yml` | Build, push, SSH, pull, up, health check. |

## One-time server setup

Docker Engine with the Compose plugin must already be installed, and your
deploy user must be in the `docker` group.

### 1. Read your Caddy network's name and subnet

```bash
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' <caddy-container>
docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' <network-name>
```

### 2. Pick a free internal subnet

```bash
docker network inspect $(docker network ls -q) \
  -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

The default is `10.83.0.0/24`. **It must not fall inside `172.31.0.0/16`**,
the default AWS VPC range — a Docker bridge there blackholes traffic to the
rest of the VPC. (The development compose file uses `172.31.250.0/24`, which
is fine on a laptop and wrong on EC2.)

### 3. Create the deployment directory

```bash
sudo install -d -o "$USER" -g "$USER" /opt/buginbox
cd /opt/buginbox
install -m 600 /dev/null .env
$EDITOR .env          # paste .env.production.example and fill it in
```

Fill in the three network values, `POSTGRES_PASSWORD`
(`openssl rand -base64 33`), `APP_BASE_URL` and `PUBLIC_BASE_URL` (the public
`https://` origin), and the SMTP block. No value may contain a `$` — Compose
interpolates it before the container sees it.

`.env` never leaves the instance. The pipeline does not read, write or copy it.

### 4. Install the Caddy site configuration — by hand

Caddy is shared with other projects, so give BugInbox its own file rather than
editing the global Caddyfile:

```bash
sudo mkdir -p /etc/caddy/sites
sudo $EDITOR /etc/caddy/sites/buginbox.caddy   # paste infra/caddy/buginbox.Caddyfile, set your hostname
```

with `import sites/*.caddy` in the global Caddyfile. Point the domain's A
record at the instance first, then validate and reload yourself:

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy      # or restart your Caddy container
```

### 5. Add the GitHub secrets

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | hostname or IP |
| `DEPLOY_USER` | SSH user, in the `docker` group |
| `DEPLOY_SSH_KEY` | that user's private key, whole file |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan <host>` |

Optional variable `DEPLOY_PATH`, default `/opt/buginbox`.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/buginbox-deploy -C "buginbox deploy" -N ""
ssh-copy-id -i ~/.ssh/buginbox-deploy.pub <user>@<host>
ssh-keyscan <host>            # -> DEPLOY_KNOWN_HOSTS
cat ~/.ssh/buginbox-deploy    # -> DEPLOY_SSH_KEY
```

The host key is pinned rather than trusted on first use, so a rebuilt instance
fails the deploy until you refresh `DEPLOY_KNOWN_HOSTS`.

No registry credential is stored on the instance: each deploy logs in with the
workflow run's own token and logs out at the end. A manual `docker compose
pull` will therefore need you to `docker login ghcr.io` yourself, with a token
that has `read:packages`.

## What a deploy does

Push to `main` → CI runs → if it passes, CD runs:

1. builds the `server` and `web` images
2. pushes both to GHCR as `latest` and `sha-<short>`
3. SSHes in (after copying `docker-compose.prod.yml` and the nginx template)
4. `docker compose -f docker-compose.prod.yml pull`
5. `docker compose -f docker-compose.prod.yml up -d --wait`
6. `curl /api/health/ready` inside the api container

Steps 4–6 are exactly what you would type by hand.

## Doing it yourself

```bash
cd /opt/buginbox
docker login ghcr.io                                   # once, with a read:packages token
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

The first owner account is created by signing up at `https://<your-domain>/signup`.
There is no production seeding step; `npm run seed` makes synthetic `.test`
data for local development only.

## Going back to an earlier build

There is no rollback automation. Every build is pushed with a `sha-` tag, so:

```bash
cd /opt/buginbox
$EDITOR .env      # BUGINBOX_SERVER_IMAGE / BUGINBOX_WEB_IMAGE -> ghcr.io/...:sha-1a2b3c4
docker compose -f docker-compose.prod.yml up -d
```

This reverts code, not the database. The api and worker apply migrations on
boot and nothing un-applies them, so check the older release can still read the
current schema first.

## Troubleshooting

**Caddy returns 502.** The `web` container is not reachable on the shared
network. Check `BUGINBOX_EDGE_NETWORK` matches Caddy's network, and that
`docker exec <caddy> nslookup buginbox-web` resolves.

**Compose says the network does not exist.** It is declared `external: true`
and is deliberately never created here. Check the name.

**Every report shows the same IP.** `BUGINBOX_EDGE_CIDR` does not cover the
address Caddy connects from, so the real client is not being recovered from
`X-Forwarded-For`. Re-read it with `docker network inspect` and recreate `web`.

**The api container restarts in a loop.** Configuration is validated at boot
and a bad value aborts startup. `docker compose -f docker-compose.prod.yml logs
api` names the variable.

**Emailed links point at the wrong host.** `APP_BASE_URL` / `PUBLIC_BASE_URL`.

**Login works but every page bounces to `/login`.** The session cookie is
`Secure`, so it is only sent over https.

## Not included

By design, so the deployment stays small enough to reason about: no rollback
automation, no blue-green or canary, no monitoring stack, no backup
automation, no infrastructure provisioning, no server setup scripts, and
nothing that manages Caddy.

`scripts/backup.sh` and `scripts/restore.sh` exist but are written for the
development stack and will not find a compose file on the server as-is.
Backups are yours to arrange.

State lives on this one instance — Postgres, Redis and the screenshot volume
are Docker volumes on its disk. Deploys are not zero-downtime: `up -d`
replaces containers, so requests fail for a few seconds.
