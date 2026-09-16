#!/usr/bin/env bash
# Back up the BugInbox database and the private screenshot volume.
#
#   ./scripts/backup.sh [destination-directory]
#
# Produces <destination>/buginbox-<timestamp>.sql.gz and uploads-<timestamp>.tar.gz.
# Both files matter: reports live in Postgres, screenshots live in the volume,
# and a restore of one without the other leaves dangling references that the
# worker's cleanup sweep will then tidy away.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DESTINATION="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DESTINATION"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "Dumping database..."
docker compose exec -T postgres pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --clean --if-exists --no-owner --no-privileges \
  | gzip > "${DESTINATION}/buginbox-${STAMP}.sql.gz"

echo "Archiving screenshot volume..."
docker compose exec -T api tar -C /data -cf - uploads \
  | gzip > "${DESTINATION}/uploads-${STAMP}.tar.gz"

echo "Wrote:"
ls -lh "${DESTINATION}/buginbox-${STAMP}.sql.gz" "${DESTINATION}/uploads-${STAMP}.tar.gz"
echo
echo "Restore with: ./scripts/restore.sh ${DESTINATION}/buginbox-${STAMP}.sql.gz ${DESTINATION}/uploads-${STAMP}.tar.gz"
