#!/usr/bin/env python3
"""
Standalone FX compiler API compatible with Calcverse /api/fxcomp.

This file is designed for simple self-hosting on any Python-capable server.
It can work with either of these layouts:
1) full fxesplus tree (multi-model)
2) compiler drop-in tree (single 580vnx model)

Usage:
  python fx_remote_api.py --host 0.0.0.0 --port 8080 --path /fx/api

Environment variables:
  PYTHON_BIN               Override interpreter used for child compiler processes.
  FX_API_PATH              API route path (default: /fx/api)
  FX_TIMEOUT_MS            Default timeout for compile requests (default: 30000)
  FX_CACHE_TTL_MS          Cache TTL in milliseconds (default: 120000)
  FX_ENABLE_FAST_580VNX    1 to enable fast path for 580vnx (default: 1)
  FX_FXESPLUS_ROOT         Explicit fxesplus root path
  FX_COMPILER_ROOT         Explicit compiler root path (where 580vnx/ and libcompiler.py live)
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


def parse_positive_int(raw: Any, fallback: int) -> int:
    try:
        value = int(str(raw).strip())
        if value > 0:
            return value
    except Exception:
        pass
    return fallback


DEFAULT_TIMEOUT_MS = parse_positive_int(os.getenv("FX_TIMEOUT_MS"), 30000)
CACHE_TTL_MS = parse_positive_int(os.getenv("FX_CACHE_TTL_MS"), 120000)
ENABLE_FAST_580 = os.getenv("FX_ENABLE_FAST_580VNX", "1").strip() != "0"
API_PATH = os.getenv("FX_API_PATH", "/fx/api").strip() or "/fx/api"
CACHE_MAX_ITEMS = 128


@dataclass
class ModelConfig:
    id: str
    label: str
    folder: str
    script: str
    formats: List[str]
    targets: List[str]
    default_format: str
    default_target: str


FX_MODELS: Dict[str, ModelConfig] = {
    "580vnx": ModelConfig(
        id="580vnx",
        label="fx-580VN X",
        folder="580vnx",
        script="compiler_.py",
        formats=["hex", "key"],
        targets=["none"],
        default_format="hex",
        default_target="none",
    ),
    "580vnx-emu": ModelConfig(
        id="580vnx-emu",
        label="fx-580VN X (emu)",
        folder="580vnx_emu",
        script="compiler.py",
        formats=["hex", "key"],
        targets=["none", "overflow", "loader"],
        default_format="hex",
        default_target="overflow",
    ),
    "570esp": ModelConfig(
        id="570esp",
        label="fx-570ES PLUS",
        folder="570esp",
        script="compiler.py",
        formats=["hex", "key"],
        targets=["none", "overflow", "loader"],
        default_format="hex",
        default_target="overflow",
    ),
    "82espa": ModelConfig(
        id="82espa",
        label="fx-82ES PLUS A",
        folder="82espa",
        script="compiler.py",
        formats=["hex", "key"],
        targets=["none", "overflow", "loader"],
        default_format="hex",
        default_target="overflow",
    ),
    "991cnx": ModelConfig(
        id="991cnx",
        label="fx-991CN X",
        folder="991cnx",
        script="compiler_.py",
        formats=["hex", "key"],
        targets=["none"],
        default_format="hex",
        default_target="none",
    ),
    "991cnx-emu": ModelConfig(
        id="991cnx-emu",
        label="fx-991CN X (emu)",
        folder="991cnx_emu",
        script="compiler_.py",
        formats=["hex", "key"],
        targets=["none"],
        default_format="hex",
        default_target="none",
    ),
}

AUTO_ORDER = ["580vnx-emu", "580vnx", "991cnx", "991cnx-emu", "570esp", "82espa"]


class BackendState:
    def __init__(self) -> None:
        self.backend_type = "none"
        self.root = Path(".")
        self.models: Dict[str, ModelConfig] = {}
        self.cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

    def detect(self) -> None:
        cwd = Path.cwd()

        fxesplus_candidates = [
            os.getenv("FX_FXESPLUS_ROOT", ""),
            str(cwd / "ollama-discord-bot" / "fxesplus"),
            str(cwd / "fxesplus"),
        ]

        compiler_candidates = [
            os.getenv("FX_COMPILER_ROOT", ""),
            str(cwd / "compiler" / "compiler"),
            str(cwd / "compiler"),
        ]

        fx_root = self._first_existing_dir(fxesplus_candidates)
        if fx_root and (fx_root / "580vnx" / "compiler_.py").exists():
            self.backend_type = "fxesplus"
            self.root = fx_root
            self.models = dict(FX_MODELS)
            return

        cmp_root = self._first_existing_dir(compiler_candidates)
        if cmp_root and (cmp_root / "580vnx" / "compiler_.py").exists() and (cmp_root / "libcompiler.py").exists():
            self.backend_type = "compiler"
            self.root = cmp_root
            self.models = {
                "580vnx": ModelConfig(
                    id="580vnx",
                    label="fx-580VN X",
                    folder="580vnx",
                    script="compiler_.py",
                    formats=["hex", "key"],
                    targets=["none"],
                    default_format="hex",
                    default_target="none",
                )
            }
            return

        self.backend_type = "none"
        self.root = cwd
        self.models = {}

    @staticmethod
    def _first_existing_dir(candidates: List[str]) -> Optional[Path]:
        for raw in candidates:
            if not raw:
                continue
            path = Path(raw).expanduser().resolve()
            if path.exists() and path.is_dir():
                return path
        return None


STATE = BackendState()
STATE.detect()


def get_python_bin() -> str:
    return " ".join(get_python_command_parts())


def get_python_command_parts() -> List[str]:
    configured = os.getenv("PYTHON_BIN", "").strip()
    if configured:
        try:
            parts = shlex.split(configured, posix=os.name != "nt")
            if parts:
                return parts
        except Exception:
            pass
        return [configured]
    return [sys.executable or "python"]


def model_meta(model: ModelConfig) -> Dict[str, Any]:
    script_path = STATE.root / model.folder / model.script
    return {
        "id": model.id,
        "label": model.label,
        "formats": model.formats,
        "targets": model.targets,
        "defaultFormat": model.default_format,
        "defaultTarget": model.default_target,
        "available": script_path.exists(),
    }


def available_models() -> List[ModelConfig]:
    result: List[ModelConfig] = []
    for model_id, model in STATE.models.items():
        script_path = STATE.root / model.folder / model.script
        if script_path.exists():
            result.append(model)
    return result


def ordered_auto_models(models: List[ModelConfig]) -> List[ModelConfig]:
    rank = {model_id: idx for idx, model_id in enumerate(AUTO_ORDER)}
    return sorted(models, key=lambda m: (rank.get(m.id, 10_000), m.id))


def parse_timeout(raw: Any) -> int:
    timeout = parse_positive_int(raw, DEFAULT_TIMEOUT_MS)
    return max(2000, min(timeout, 90000))


def pick(value: str, allowed: List[str], fallback: str) -> str:
    if value in allowed:
        return value
    return fallback


def should_retry_580_full(error_text: str) -> bool:
    s = (error_text or "").lower()
    return "unrecognized command" in s or "appears twice" in s


def cache_key(model_id: str, fmt: str, target: str, program: str) -> str:
    return "\x00".join([model_id, fmt, target, program])


def cache_get(key: str) -> Optional[Dict[str, Any]]:
    hit = STATE.cache.get(key)
    if not hit:
        return None
    expires_at, payload = hit
    if time.time() > expires_at:
        STATE.cache.pop(key, None)
        return None
    return payload


def cache_set(key: str, payload: Dict[str, Any]) -> None:
    STATE.cache[key] = (time.time() + (CACHE_TTL_MS / 1000.0), payload)
    while len(STATE.cache) > CACHE_MAX_ITEMS:
        oldest = next(iter(STATE.cache.keys()))
        STATE.cache.pop(oldest, None)


def run_compiler(model: ModelConfig, program: str, fmt: str, target: str, timeout_ms: int, extra_args: Optional[List[str]] = None) -> Tuple[str, str]:
    extra_args = extra_args or []
    cwd = STATE.root / model.folder
    script_path = cwd / model.script
    python_cmd = get_python_command_parts()

    args = [*python_cmd, str(script_path), "-f", fmt, "-t", target, *extra_args]

    proc = subprocess.run(
        args,
        input=program,
        text=True,
        capture_output=True,
        cwd=str(cwd),
        timeout=timeout_ms / 1000.0,
        check=False,
    )

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    if proc.returncode != 0:
        raise RuntimeError(stderr or stdout or f"Compiler exited with code {proc.returncode}.")

    return stdout, stderr


def compile_model(model: ModelConfig, program: str, requested_format: str, requested_target: str, timeout_ms: int) -> Dict[str, Any]:
    fmt = pick(requested_format, model.formats, model.default_format)
    target = pick(requested_target, model.targets, model.default_target)

    key = cache_key(model.id, fmt, target, program)
    cached = cache_get(key)
    if cached:
        return cached

    if ENABLE_FAST_580 and model.id == "580vnx":
        try:
            out, warn = run_compiler(model, program, fmt, target, timeout_ms, ["--command-source", "gadgets"])
            payload = {
                "ok": True,
                "model": model.id,
                "format": fmt,
                "target": target,
                "output": out,
                "warnings": warn or None,
            }
            cache_set(key, payload)
            return payload
        except Exception as exc:
            msg = str(exc)
            if not should_retry_580_full(msg):
                raise

            out, warn = run_compiler(model, program, fmt, target, timeout_ms, ["--command-source", "all"])
            combined_warn = "\n".join([x for x in ["Fast mode fallback: retried with full command-source=all.", warn] if x])
            payload = {
                "ok": True,
                "model": model.id,
                "format": fmt,
                "target": target,
                "output": out,
                "warnings": combined_warn or None,
            }
            cache_set(key, payload)
            return payload

    out, warn = run_compiler(model, program, fmt, target, timeout_ms)
    payload = {
        "ok": True,
        "model": model.id,
        "format": fmt,
        "target": target,
        "output": out,
        "warnings": warn or None,
    }
    cache_set(key, payload)
    return payload


def metadata_payload() -> Dict[str, Any]:
    models = [model_meta(model) for model in STATE.models.values()]
    return {
        "ok": True,
        "mode": "remote-python",
        "backendType": STATE.backend_type,
        "backendRoot": str(STATE.root),
        "pythonCommand": get_python_bin(),
        "models": models,
    }


def can_serve_path(path: str) -> bool:
    # Accept root and configured path for easier deployment behind reverse proxies.
    normalized = path.rstrip("/") or "/"
    api_norm = API_PATH.rstrip("/") or "/"
    return normalized in {"/", api_norm}


class FxApiHandler(BaseHTTPRequestHandler):
    server_version = "FxRemoteApi/1.0"

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            raise ValueError("Invalid JSON payload.")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not can_serve_path(path):
            self._send_json(404, {"ok": False, "error": "Not found."})
            return

        self._send_json(200, metadata_payload())

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if not can_serve_path(path):
            self._send_json(404, {"ok": False, "error": "Not found."})
            return

        if STATE.backend_type == "none":
            self._send_json(500, {"ok": False, "error": "No compiler backend detected on server."})
            return

        try:
            body = self._read_json()
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return

        program = str(body.get("program", ""))
        if not program.strip():
            self._send_json(400, {"ok": False, "error": "Program input is empty."})
            return

        requested_model = str(body.get("model", "auto") or "auto").strip() or "auto"
        requested_format = str(body.get("format", "")).strip()
        requested_target = str(body.get("target", "")).strip()
        timeout_ms = parse_timeout(body.get("timeoutMs"))

        models = available_models()
        if not models:
            self._send_json(500, {"ok": False, "error": "No available compiler models on server."})
            return

        try:
            if requested_model == "auto":
                errors: List[str] = []
                for model in ordered_auto_models(models):
                    try:
                        payload = compile_model(model, program, requested_format, requested_target, timeout_ms)
                        self._send_json(200, payload)
                        return
                    except Exception as exc:
                        errors.append(f"{model.id}: {str(exc).splitlines()[0]}")

                self._send_json(422, {"ok": False, "error": f"All models failed. {' | '.join(errors)}"})
                return

            selected = next((m for m in models if m.id == requested_model), None)
            if selected is None:
                self._send_json(400, {"ok": False, "error": "Requested model is not available."})
                return

            payload = compile_model(selected, program, requested_format, requested_target, timeout_ms)
            self._send_json(200, payload)
        except subprocess.TimeoutExpired:
            self._send_json(500, {"ok": False, "error": f"Timeout after {timeout_ms}ms while compiling."})
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc) or "Compilation failed."})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep logs concise and consistent.
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    global API_PATH

    parser = argparse.ArgumentParser(description="Standalone FX compiler API")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", default=8080, type=int, help="Bind port (default: 8080)")
    parser.add_argument("--path", default=API_PATH, help="API path (default: /fx/api)")
    args = parser.parse_args()

    API_PATH = args.path.strip() or "/fx/api"

    STATE.detect()
    server = ThreadingHTTPServer((args.host, args.port), FxApiHandler)
    print(f"FX remote API listening on http://{args.host}:{args.port}{API_PATH}")
    print(f"Backend: {STATE.backend_type} @ {STATE.root}")
    server.serve_forever()


if __name__ == "__main__":
    main()
