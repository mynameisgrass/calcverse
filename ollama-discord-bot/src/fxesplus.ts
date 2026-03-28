import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FX_ROOT = path.join(PROJECT_ROOT, "fxesplus");

type FxFormat = "hex" | "key";
type FxTarget = "none" | "overflow" | "loader";

type ModelConfig = {
  script: string;
  cwd: string;
  formats: FxFormat[];
  targets: FxTarget[];
  defaultFormat: FxFormat;
  defaultTarget: FxTarget;
};

// Order matters: we try 580 variants first for fx-580 style code, then others.
const FX_MODEL_ORDER = [
  "580vnx",
  "580vnx-emu",
  "570esp",
  "82espa",
  "991cnx",
  "991cnx-emu",
] as const;

const FX_MODELS: Record<string, ModelConfig> = {
  "580vnx": {
    script: "compiler_.py",
    cwd: path.join(FX_ROOT, "580vnx"),
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
  "580vnx-emu": {
    script: "compiler.py",
    cwd: path.join(FX_ROOT, "580vnx_emu"),
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "570esp": {
    script: "compiler.py",
    cwd: path.join(FX_ROOT, "570esp"),
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "82espa": {
    script: "compiler.py",
    cwd: path.join(FX_ROOT, "82espa"),
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
  },
  "991cnx": {
    script: "compiler_.py",
    cwd: path.join(FX_ROOT, "991cnx"),
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
  "991cnx-emu": {
    script: "compiler_.py",
    cwd: path.join(FX_ROOT, "991cnx_emu"),
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
  },
};

export type FxModel = keyof typeof FX_MODELS;
export type FxCompileOptions = {
  format?: FxFormat;
  target?: FxTarget;
  timeoutMs?: number;
};

export type FxCompileAutoResult = {
  model: FxModel;
  output: string;
};

export type FxToolOptions = {
  args?: string[];
  timeoutMs?: number;
};

const ensureFxRoot = () => fs.existsSync(FX_ROOT);

const resolveModel = (model: string): ModelConfig => {
  const config = FX_MODELS[model];
  if (!config) {
    throw new Error(`Unknown fxesplus model: ${model}`);
  }
  return config;
};

export const availableFxModels = (): FxModel[] =>
  FX_MODEL_ORDER.filter((model) => {
    const config = FX_MODELS[model];
    const scriptPath = path.join(config.cwd, config.script);
    return ensureFxRoot() && fs.existsSync(scriptPath);
  }) as FxModel[];

export const defaultFxModel = (): FxModel | null => {
  const models = availableFxModels();
  return models.length ? models[0] : null;
};

export async function compileFx(
  model: string,
  program: string,
  options: FxCompileOptions = {}
): Promise<string> {
  if (!ensureFxRoot()) {
    throw new Error("fxesplus folder not found. Clone fxesplus into project root.");
  }

  const config = resolveModel(model);
  const scriptPath = path.join(config.cwd, config.script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Compiler script missing for model ${model} at ${scriptPath}`);
  }

  const format: FxFormat = options.format || config.defaultFormat;
  if (!config.formats.includes(format)) {
    throw new Error(`Format ${format} not supported for model ${model}.`);
  }

  const target: FxTarget = options.target || config.defaultTarget;
  if (!config.targets.includes(target)) {
    throw new Error(`Target ${target} not supported for model ${model}.`);
  }

  const args = [scriptPath, "-f", format, "-t", target];
  const timeoutMs = options.timeoutMs ?? 20000;

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", args, { cwd: config.cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`fxesplus compiler for ${model} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `fxesplus compiler exited with code ${code}`));
      }
    });

    proc.stdin.write(program);
    proc.stdin.end();
  });
}

export const availableFxTools = (): string[] => {
  if (!ensureFxRoot()) return [];
  try {
    return fs
      .readdirSync(FX_ROOT)
      .filter((f: string) => f.toLowerCase().endsWith(".py"))
      .sort();
  } catch {
    return [];
  }
};

export async function compileFxAuto(
  program: string,
  options: FxCompileOptions = {}
): Promise<FxCompileAutoResult> {
  const models = availableFxModels();
  if (!models.length) throw new Error("No fxesplus models available.");

  const errors: string[] = [];
  for (const model of models) {
    try {
      const output = await compileFx(model, program, options);
      return { model, output };
    } catch (err: any) {
      const msg = (err?.message || String(err) || "unknown error").split("\n")[0];
      errors.push(`${model}: ${msg}`);
    }
  }
  throw new Error(`All fxesplus models failed. Details: ${errors.join(" | ")}`);
}

export async function runFxTool(tool: string, options: FxToolOptions = {}): Promise<string> {
  if (!ensureFxRoot()) throw new Error("fxesplus folder not found.");
  const tools = availableFxTools();
  if (!tools.includes(tool)) {
    throw new Error(`Tool ${tool} not found in fxesplus root.`);
  }

  const toolPath = path.join(FX_ROOT, tool);
  const args = options.args || [];
  const timeoutMs = options.timeoutMs ?? 20000;

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [toolPath, ...args], { cwd: FX_ROOT });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`fx tool ${tool} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `fx tool exited with code ${code}`));
    });
  });
}
