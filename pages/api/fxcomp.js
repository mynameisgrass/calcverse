import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const FX_ROOT = path.join(process.cwd(), "ollama-discord-bot", "fxesplus");
const FXCOMP_REMOTE_URL = String(process.env.FXCOMP_REMOTE_URL || "").trim().replace(/\/+$/, "");
const FXCOMP_REMOTE_ONLY = String(process.env.FXCOMP_REMOTE_ONLY || "").trim() === "1";
const FX_ENABLE_FAST_580VNX = String(process.env.FX_ENABLE_FAST_580VNX || "1").trim() !== "0";

const FX_MODEL_ORDER = [
  "580vnx",
  "580vnx-emu",
  "570esp",
  "82espa",
  "991cnx",
  "991cnx-emu",
];

// Prefer fast/stable compilers for auto mode; explicit model selection is unchanged.
const FX_AUTO_MODEL_ORDER = [
  "580vnx-emu",
  "580vnx",
  "991cnx",
  "991cnx-emu",
  "570esp",
  "82espa",
];

const FX_MODELS = {
  "580vnx": {
    id: "580vnx",
    label: "fx-580VN X",
    folder: "580vnx",
    script: "compiler_.py",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
  "580vnx-emu": {
    id: "580vnx-emu",
    label: "fx-580VN X (emu)",
    folder: "580vnx_emu",
    script: "compiler.py",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "570esp": {
    id: "570esp",
    label: "fx-570ES PLUS",
    folder: "570esp",
    script: "compiler.py",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "82espa": {
    id: "82espa",
    label: "fx-82ES PLUS A",
    folder: "82espa",
    script: "compiler.py",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "991cnx": {
    id: "991cnx",
    label: "fx-991CN X",
    folder: "991cnx",
    script: "compiler_.py",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
  "991cnx-emu": {
    id: "991cnx-emu",
    label: "fx-991CN X (emu)",
    folder: "991cnx_emu",
    script: "compiler_.py",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
};

const DEFAULT_TIMEOUT_MS = 30000;
const CACHE_MAX_ITEMS = 128;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const FX_CACHE_TTL_MS = parsePositiveInt(process.env.FX_CACHE_TTL_MS, 120000);
const FX_COMPILE_CACHE = new Map();

function buildCacheKey({ model, format, target, program }) {
  return [model, format, target, program].join("\u0000");
}

function getCachedCompile(cacheKey) {
  const entry = FX_COMPILE_CACHE.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    FX_COMPILE_CACHE.delete(cacheKey);
    return null;
  }

  return entry.payload;
}

function setCachedCompile(cacheKey, payload) {
  FX_COMPILE_CACHE.set(cacheKey, {
    payload,
    expiresAt: Date.now() + FX_CACHE_TTL_MS,
  });

  while (FX_COMPILE_CACHE.size > CACHE_MAX_ITEMS) {
    const oldestKey = FX_COMPILE_CACHE.keys().next().value;
    if (!oldestKey) break;
    FX_COMPILE_CACHE.delete(oldestKey);
  }
}

function getAutoOrderedModels(availableModels) {
  const rank = new Map(FX_AUTO_MODEL_ORDER.map((id, index) => [id, index]));
  return [...availableModels].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
}

function shouldRetry580WithFullSource(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  return message.includes("unrecognized command") || message.includes("appears twice");
}

function remoteConfigured() {
  return Boolean(FXCOMP_REMOTE_URL);
}

function shouldFallbackToRemote(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  return (
    message.includes("failed to start python process") ||
    message.includes("no fx compiler models are available") ||
    message.includes("fxesplus folder not found") ||
    message.includes("spawn") ||
    message.includes("enoent") ||
    message.includes("filenotfounderror")
  );
}

async function callRemoteFxcomp(method, payload) {
  if (!remoteConfigured()) {
    throw new Error("Remote fxcomp URL is not configured.");
  }

  const response = await fetch(FXCOMP_REMOTE_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(payload || {}) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Remote fxcomp returned non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok || !json?.ok) {
    const remoteError = json?.error || `Remote fxcomp error (HTTP ${response.status}).`;
    throw new Error(remoteError);
  }

  return json;
}

function getPythonCommand() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    return process.env.PYTHON_BIN.trim();
  }

  return process.platform === "win32" ? "python" : "python3";
}

function buildModelMeta(model) {
  const cwd = path.join(FX_ROOT, model.folder);
  const scriptPath = path.join(cwd, model.script);
  const available = fs.existsSync(scriptPath);

  return {
    ...model,
    cwd,
    scriptPath,
    available,
  };
}

function getAvailableModels() {
  return FX_MODEL_ORDER.map((id) => buildModelMeta(FX_MODELS[id])).filter((model) => model.available);
}

function pickValueOrDefault(value, allowed, fallback) {
  if (allowed.includes(value)) return value;
  return fallback;
}

function runCompile(modelMeta, program, options) {
  const pythonCommand = getPythonCommand();
  const timeoutMs = options.timeoutMs;
  const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
  const args = [modelMeta.scriptPath, "-f", options.format, "-t", options.target, ...extraArgs];

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCommand, args, { cwd: modelMeta.cwd });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Timeout after ${timeoutMs}ms while compiling for ${modelMeta.id}.`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python process (${pythonCommand}). ${error.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      const message = stderr.trim() || stdout.trim() || `Compiler exited with code ${code}.`;
      reject(new Error(message));
    });

    proc.stdin.write(program);
    proc.stdin.end();
  });
}

function parseTimeout(rawTimeout) {
  const parsed = Number.parseInt(String(rawTimeout ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(2000, Math.min(parsed, 90000));
}

function normalizeModelRequest(modelId) {
  const value = String(modelId || "auto").trim();
  return value || "auto";
}

function payloadError(response, statusCode, message) {
  response.status(statusCode).json({ ok: false, error: message });
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    if (FXCOMP_REMOTE_ONLY) {
      try {
        const remotePayload = await callRemoteFxcomp("GET");
        response.status(200).json({
          ...remotePayload,
          mode: "remote-only",
          remoteConfigured: true,
        });
      } catch (error) {
        payloadError(response, 502, `Remote fxcomp failed: ${error.message}`);
      }
      return;
    }

    const models = FX_MODEL_ORDER.map((id) => buildModelMeta(FX_MODELS[id]));
    const hasAvailableLocal = models.some((model) => model.available);

    if (!hasAvailableLocal && remoteConfigured()) {
      try {
        const remotePayload = await callRemoteFxcomp("GET");
        response.status(200).json({
          ...remotePayload,
          mode: "remote-fallback",
          remoteConfigured: true,
          localFxRoot: FX_ROOT,
          localFxRootExists: fs.existsSync(FX_ROOT),
        });
        return;
      } catch (error) {
        response.status(200).json({
          ok: true,
          fxRoot: FX_ROOT,
          fxRootExists: fs.existsSync(FX_ROOT),
          pythonCommand: getPythonCommand(),
          remoteConfigured: true,
          remoteWarning: error.message,
          models: models.map((model) => ({
            id: model.id,
            label: model.label,
            formats: model.formats,
            targets: model.targets,
            defaultFormat: model.defaultFormat,
            defaultTarget: model.defaultTarget,
            available: model.available,
          })),
        });
        return;
      }
    }

    response.status(200).json({
      ok: true,
      fxRoot: FX_ROOT,
      fxRootExists: fs.existsSync(FX_ROOT),
      pythonCommand: getPythonCommand(),
      remoteConfigured: remoteConfigured(),
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        formats: model.formats,
        targets: model.targets,
        defaultFormat: model.defaultFormat,
        defaultTarget: model.defaultTarget,
        available: model.available,
      })),
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    payloadError(response, 405, "Method not allowed.");
    return;
  }

  if (!fs.existsSync(FX_ROOT)) {
    payloadError(response, 500, "fxesplus folder not found at expected path.");
    return;
  }

  const program = String(request.body?.program || "");
  if (!program.trim()) {
    payloadError(response, 400, "Program input is empty.");
    return;
  }

  const requestedModel = normalizeModelRequest(request.body?.model);
  const requestedFormat = String(request.body?.format || "").trim();
  const requestedTarget = String(request.body?.target || "").trim();
  const timeoutMs = parseTimeout(request.body?.timeoutMs);

  if (FXCOMP_REMOTE_ONLY) {
    try {
      const remoteResult = await callRemoteFxcomp("POST", {
        model: requestedModel,
        format: requestedFormat,
        target: requestedTarget,
        timeoutMs,
        program,
      });
      response.status(200).json({
        ...remoteResult,
        mode: "remote-only",
      });
    } catch (error) {
      payloadError(response, 502, `Remote fxcomp failed: ${error.message}`);
    }
    return;
  }

  const availableModels = getAvailableModels();
  const tryRemoteFallback = async (localError) => {
    if (!remoteConfigured()) return false;

    try {
      const remoteResult = await callRemoteFxcomp("POST", {
        model: requestedModel,
        format: requestedFormat,
        target: requestedTarget,
        timeoutMs,
        program,
      });

      response.status(200).json({
        ...remoteResult,
        mode: "remote-fallback",
        localWarning: localError,
      });
      return true;
    } catch (remoteError) {
      payloadError(response, 500, `${localError} | Remote fallback failed: ${remoteError.message}`);
      return true;
    }
  };

  if (!availableModels.length) {
    const handled = await tryRemoteFallback("No fx compiler models are available.");
    if (handled) return;
    payloadError(response, 500, "No fx compiler models are available.");
    return;
  }

  const compileWithModel = async (modelMeta) => {
    const format = pickValueOrDefault(requestedFormat, modelMeta.formats, modelMeta.defaultFormat);
    const target = pickValueOrDefault(requestedTarget, modelMeta.targets, modelMeta.defaultTarget);
    const cacheKey = buildCacheKey({
      model: modelMeta.id,
      format,
      target,
      program,
    });

    const cached = getCachedCompile(cacheKey);
    if (cached) {
      return cached;
    }

    const toPayload = (result, warnings) => ({
      ok: true,
      model: modelMeta.id,
      format,
      target,
      output: result.stdout,
      warnings,
    });

    if (FX_ENABLE_FAST_580VNX && modelMeta.id === "580vnx") {
      try {
        const fastResult = await runCompile(modelMeta, program, {
          format,
          target,
          timeoutMs,
          extraArgs: ["--command-source", "gadgets"],
        });

        const payload = toPayload(fastResult, fastResult.stderr || null);
        setCachedCompile(cacheKey, payload);
        return payload;
      } catch (error) {
        const message = String(error?.message || error || "");
        if (!shouldRetry580WithFullSource(message)) {
          throw error;
        }

        const fullResult = await runCompile(modelMeta, program, {
          format,
          target,
          timeoutMs,
          extraArgs: ["--command-source", "all"],
        });

        const combinedWarnings = [
          "Fast mode fallback: retried with full command-source=all.",
          fullResult.stderr || null,
        ]
          .filter(Boolean)
          .join("\n");

        const payload = toPayload(fullResult, combinedWarnings || null);
        setCachedCompile(cacheKey, payload);
        return payload;
      }
    }

    const result = await runCompile(modelMeta, program, {
      format,
      target,
      timeoutMs,
    });

    const payload = toPayload(result, result.stderr || null);
    setCachedCompile(cacheKey, payload);
    return payload;
  };

  try {
    if (requestedModel === "auto") {
      const errors = [];
      const autoOrderedModels = getAutoOrderedModels(availableModels);

      for (const modelMeta of autoOrderedModels) {
        try {
          const result = await compileWithModel(modelMeta);
          response.status(200).json(result);
          return;
        } catch (error) {
          errors.push(`${modelMeta.id}: ${error.message.split("\n")[0]}`);
        }
      }

      const allErrorMessage = `All models failed. ${errors.join(" | ")}`;
      if (shouldFallbackToRemote(allErrorMessage)) {
        const handled = await tryRemoteFallback(allErrorMessage);
        if (handled) return;
      }

      payloadError(response, 422, allErrorMessage);
      return;
    }

    const selected = availableModels.find((model) => model.id === requestedModel);
    if (!selected) {
      const handled = await tryRemoteFallback("Requested model is not available.");
      if (handled) return;

      payloadError(response, 400, "Requested model is not available.");
      return;
    }

    const result = await compileWithModel(selected);
    response.status(200).json(result);
  } catch (error) {
    if (shouldFallbackToRemote(error.message)) {
      const handled = await tryRemoteFallback(error.message || "Compilation failed.");
      if (handled) return;
    }

    payloadError(response, 500, error.message || "Compilation failed.");
  }
}
