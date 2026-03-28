#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example and fill tokens first." >&2
  exit 1
fi

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    echo "docker compose not found. Install Docker Compose." >&2
    exit 1
  fi
fi

log() { echo "[setup] $*"; }

for f in compiler/rom.bin compiler/disas.txt; do
  if [ ! -f "$f" ]; then
    log "WARN: missing $f (compiler may fail)"
  fi
done

log "Starting containers (build if needed)"
$COMPOSE up -d --build

MODEL="${OLLAMA_MODEL:-dolphin3:8b}"
log "Ensuring Ollama model: $MODEL"

# wait a bit for ollama to come up
for i in {1..10}; do
  if $COMPOSE exec -T ollama ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if $COMPOSE exec -T ollama ollama list | grep -q "^$MODEL"; then
  log "Model already present, skipping pull"
else
  $COMPOSE exec -T ollama ollama pull "$MODEL"
fi

log "Done. Tail logs with: $COMPOSE logs -f bot"
