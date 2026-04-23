#!/usr/bin/env bash
# Deploy script — executed on the VPS by GitHub Actions (or manually via SSH).
# Assumes the repo is cloned at $APP_DIR with .env.production already filled in.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/timbreuse}"
BRANCH="${BRANCH:-main}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

cd "$APP_DIR"

echo "▶ Pulling latest from $BRANCH"
git fetch --prune origin
git reset --hard "origin/$BRANCH"

echo "▶ Building images"
$COMPOSE build --pull

echo "▶ Bringing up the stack (rolling)"
$COMPOSE up -d --remove-orphans

echo "▶ Waiting for backend health"
for i in {1..30}; do
  if $COMPOSE exec -T backend python -c "import json,urllib.request,sys; r=urllib.request.urlopen('http://localhost:8000/api/health/', timeout=2); sys.exit(0 if json.load(r).get('status')=='ok' else 1)" 2>/dev/null; then
    echo "✓ Backend healthy"
    break
  fi
  sleep 2
done

echo "▶ Pruning old images"
docker image prune -f >/dev/null

echo "✓ Deploy complete"
$COMPOSE ps
