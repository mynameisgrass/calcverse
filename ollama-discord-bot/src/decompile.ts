export function decompileHexToLines(hexInput: string): string {
  // Simple hex prettifier; replace with a real decompiler when available.
  const clean = hexInput.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (clean.length === 0) return "No hex data provided.";
  const bytes = clean.match(/.{1,2}/g) || [];
  const lines: string[] = [];
  lines.push(`bytes: ${bytes.length}`);
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const addr = i.toString(16).padStart(4, "0");
    lines.push(`${addr}: ${chunk.join(" ")}`);
  }
  return lines.join("\n");
}
