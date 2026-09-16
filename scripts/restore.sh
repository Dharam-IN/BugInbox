#!/usr/bin/env bash
# Restore a BugInbox backup produced by ./scripts/backup.sh
#
#   ./scripts/restore.sh <database.sql.gz> <uploads.tar.gz>
#
# This overwrites the current database and screenshot volume. It asks first.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB_DUMP="${1:?usage: restore.sh <database.sql.gz> <uploads.tar.gz>}"
UPLOADS="${2:?usage: restore.sh <database.sql.gz> <uploads.tar.gz>}"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "This replaces the contents of database '${POSTGRES_DB}' and the uploads volume."
read -r -p "Type RESTORE to continue: " CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

echo "Restoring database..."
gunzip -c "$DB_DUMP" | docker compose exec -T postgres psql \
  --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" --quiet --set ON_ERROR_STOP=on

echo "Restoring screenshots..."
# /data/uploads is a volume mount point, so clear its contents rather than the
# directory itself.
docker compose exec -T api sh -c 'find /data/uploads -mindepth 1 -delete'
gunzip -c "$UPLOADS" | docker compose exec -T api tar -C /data -xf -

echo "Restarting the application..."
docker compose restart api worker >/dev/null

echo "Done. Check http://localhost:${BUGINBOX_WEB_PORT:-58080}/api/health/ready"
