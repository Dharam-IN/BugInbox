#!/usr/bin/env bash
# Source this to run server scripts and tests on the host against the
# containers published on loopback: `source scripts/host-env.sh`
set -a
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/../.env"
set +a

export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${BUGINBOX_POSTGRES_PORT}/${POSTGRES_DB}"
export REDIS_URL="redis://127.0.0.1:${BUGINBOX_REDIS_PORT}"
export STORAGE_DIR="${STORAGE_DIR_HOST:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.local/uploads}"
export SMTP_HOST=127.0.0.1
export SMTP_PORT="${BUGINBOX_SMTP_PORT:-51025}"
mkdir -p "$STORAGE_DIR"
