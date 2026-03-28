import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const COMPILER_DIR = path.join(PROJECT_ROOT, "compiler");
const COMPILER_ENTRY = path.join(COMPILER_DIR, "complier.py");
const DECOMPILER_ENTRY = path.join(COMPILER_DIR, "decompiler.py");
export function compilerAvailable() {
    return fs.existsSync(COMPILER_ENTRY);
}
export async function runCompile(input) {
    if (!compilerAvailable()) {
        throw new Error("compiler/complier.py not found. Add compiler assets first.");
    }
    return new Promise((resolve, reject) => {
        const proc = spawn("python3", [COMPILER_ENTRY, "-f", "hex"], {
            cwd: COMPILER_DIR,
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        proc.on("error", (err) => reject(err));
        proc.on("close", (code) => {
            if (code === 0) {
                const warning = stderr.trim();
                const out = stdout.trim();
                if (warning && out)
                    resolve(`${out}\n\n[warning]\n${warning}`);
                else if (warning)
                    resolve(`[warning]\n${warning}`);
                else
                    resolve(out);
            }
            else {
                reject(new Error(stderr.trim() || `compiler exited with code ${code}`));
            }
        });
        proc.stdin.write(input);
        proc.stdin.end();
    });
}
export function decompilerAvailable() {
    return fs.existsSync(DECOMPILER_ENTRY);
}
export async function runDecompile(input) {
    if (!decompilerAvailable()) {
        throw new Error("compiler/decompiler.py not found.");
    }
    return new Promise((resolve, reject) => {
        const proc = spawn("python3", [DECOMPILER_ENTRY], {
            cwd: COMPILER_DIR,
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        proc.on("error", (err) => reject(err));
        proc.on("close", (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            }
            else {
                reject(new Error(stderr.trim() || `decompiler exited with code ${code}`));
            }
        });
        proc.stdin.write(input);
        proc.stdin.end();
    });
}
//# sourceMappingURL=compiler.js.map