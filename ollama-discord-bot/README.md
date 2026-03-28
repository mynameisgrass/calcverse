# Ollama Discord Bot (dolphin3:8b)

Self-hosted Discord bot that chats via Ollama and can invoke a local ROP DSL compiler. Dockerized for easy bring-up.

## Prereqs
- Docker & docker-compose
- Discord bot token + application/client ID (and optional guild ID for fast command registration)

## Quick start
1) Copy `.env.example` to `.env` and fill:
   - DISCORD_TOKEN=...
   - DISCORD_CLIENT_ID=...
   - DISCORD_GUILD_ID=... (optional but recommended)
   - OLLAMA_MODEL=... (if using local Ollama)
   - GOOGLE_API_KEY=... (set to use Google Generative AI)
   - GOOGLE_MODEL=gemini-1.5-flash-latest (override if desired)
2) `./install.sh` (uses docker compose; builds, starts, pulls model if missing)
3) Invite the bot to your server. Slash commands: `/chat`, `/compile`, `/decompile` (real decompiler using libdecompiler.py). Prefix commands also available: `!comp`, `!decomp`.

## Compiler assets
Place required files under `compiler/`:
- rom.bin
- disas.txt
- gadgets.txt
- labels.txt
- labels_sfr.txt
- extensions.txt

The provided `complier.py` expects these. Without them `/compile` will respond with an informative error. `run.sh` shows a sample CLI usage (`python ./complier.py -f hex < input.rsc`).

## Local dev
- `npm install`
- `npm run dev` (needs local Ollama at http://localhost:11434)

## Notes
- Ollama host defaults to `http://ollama:11434` in Docker and `http://localhost:11434` otherwise.
- Model name defaults to `dolphin3:8b` (override via `OLLAMA_MODEL`).
- Logs: `docker compose logs -f bot`.
