function parseHexPairs(text) {
  const bytes = [];
  const tokenPattern = /(?:0x)?([0-9a-fA-F]{2})(?![0-9a-fA-F])/g;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    bytes.push(Number.parseInt(match[1], 16));
  }

  return bytes;
}

function parseContiguousHex(text) {
  const compact = String(text || "")
    .replace(/0x/gi, "")
    .replace(/[^0-9a-fA-F]/g, "");

  if (!compact || compact.length % 2 !== 0) return [];

  const bytes = [];
  for (let i = 0; i < compact.length; i += 2) {
    bytes.push(Number.parseInt(compact.slice(i, i + 2), 16));
  }
  return bytes;
}

function parseAddressedSegments(rawInput) {
  const lines = String(rawInput || "").split(/\r?\n/);
  const segments = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:0x)?([0-9a-fA-F]{2,8})\s*:\s*(.+)$/);
    if (!match) continue;

    const address = Number.parseInt(match[1], 16);
    const bytes = parseHexPairs(match[2]);
    if (!bytes.length) continue;

    segments.push({ address, bytes });
  }

  return segments;
}

function parseHexLineSegments(rawInput) {
  const lines = String(rawInput || "").split(/\r?\n/);
  const bytes = [];

  for (const line of lines) {
    const match = line.match(/^\s*hex\s*:?\s*(.+)$/i);
    if (!match) continue;

    bytes.push(...parseHexPairs(match[1]));
  }

  return bytes;
}

function parsePayload(rawInput) {
  const addressed = parseAddressedSegments(rawInput);
  if (addressed.length) {
    const flattened = addressed.flatMap((segment) => segment.bytes);
    return {
      bytes: flattened,
      baseAddress: addressed[0].address,
      addressedSegments: addressed,
    };
  }

  const hexLines = parseHexLineSegments(rawInput);
  if (hexLines.length) {
    return {
      bytes: hexLines,
      baseAddress: null,
      addressedSegments: [],
    };
  }

  const pairBytes = parseHexPairs(rawInput);
  if (pairBytes.length) {
    return {
      bytes: pairBytes,
      baseAddress: null,
      addressedSegments: [],
    };
  }

  const contiguous = parseContiguousHex(rawInput);
  if (contiguous.length) {
    return {
      bytes: contiguous,
      baseAddress: null,
      addressedSegments: [],
    };
  }

  return {
    bytes: [],
    baseAddress: null,
    addressedSegments: [],
  };
}

function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function formatHex(value, pad) {
  return value.toString(16).padStart(pad, "0");
}

function formatHexDump(bytes, baseAddress, addressedSegments) {
  const lines = [];

  if (addressedSegments.length) {
    for (const segment of addressedSegments) {
      const rows = chunk(segment.bytes, 16);
      rows.forEach((row, rowIndex) => {
        const address = segment.address + rowIndex * 16;
        const hexPart = row.map((value) => formatHex(value, 2)).join(" ");
        lines.push("0x" + formatHex(address, 4) + ": " + hexPart);
      });
    }

    return lines.join("\n");
  }

  const rows = chunk(bytes, 16);
  rows.forEach((row, rowIndex) => {
    const address = baseAddress == null ? rowIndex * 16 : baseAddress + rowIndex * 16;
    const prefix = baseAddress == null ? "+" + formatHex(address, 4) : "0x" + formatHex(address, 4);
    const hexPart = row.map((value) => formatHex(value, 2)).join(" ");
    lines.push(prefix + ": " + hexPart);
  });

  return lines.join("\n");
}

function formatAsciiPreview(bytes) {
  const chars = bytes.map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : "."));
  return chunk(chars, 64)
    .map((row, rowIndex) => "+" + formatHex(rowIndex * 64, 4) + ": " + row.join(""))
    .join("\n");
}

function formatLittleEndianWords(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const low = bytes[i];
    const high = i + 1 < bytes.length ? bytes[i + 1] : 0;
    words.push((high << 8) | low);
  }

  return chunk(words, 8)
    .map((row, rowIndex) => {
      const offset = rowIndex * 16;
      const values = row.map((word) => formatHex(word, 4)).join(" ");
      return "+" + formatHex(offset, 4) + ": " + values;
    })
    .join("\n");
}

function topByteFrequencies(bytes, topN) {
  const counts = new Map();
  for (const value of bytes) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => "0x" + formatHex(value, 2) + " => " + count)
    .join("\n");
}

function shannonEntropy(bytes) {
  if (!bytes.length) return 0;

  const counts = new Map();
  for (const value of bytes) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / bytes.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

function buildDecompileReport(parsed) {
  const { bytes, baseAddress, addressedSegments } = parsed;
  const entropy = shannonEntropy(bytes);

  const sections = [];
  sections.push(
    "Decompiler note: this is a best-effort payload inspection. Exact source reconstruction is not guaranteed."
  );
  sections.push("Hex Dump\n" + formatHexDump(bytes, baseAddress, addressedSegments));
  sections.push("ASCII Preview\n" + formatAsciiPreview(bytes));
  sections.push("Little-endian 16-bit Words\n" + formatLittleEndianWords(bytes));
  sections.push("Top Byte Frequencies\n" + topByteFrequencies(bytes, 8));

  return {
    mode: "best-effort",
    byteCount: bytes.length,
    baseAddress: baseAddress == null ? null : "0x" + formatHex(baseAddress, 4),
    summary:
      "Entropy " + entropy.toFixed(3) +
      " bits/byte. Useful for quick inspection and payload diffing.",
    output: sections.join("\n\n"),
  };
}

function payloadError(response, statusCode, message) {
  response.status(statusCode).json({ ok: false, error: message });
}

export default function handler(request, response) {
  if (request.method === "GET") {
    response.status(200).json({
      ok: true,
      mode: "best-effort",
      name: "FX Decompiler",
      accepts: [
        "Addressed output (example: 0x8da4: 00 12 34)",
        "hex: line payload",
        "Plain hex bytes",
      ],
      note: "Best-effort inspection only; original source reconstruction may not be exact.",
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    payloadError(response, 405, "Method not allowed.");
    return;
  }

  const rawInput = String(request.body?.input || "");
  if (!rawInput.trim()) {
    payloadError(response, 400, "Decompiler input is empty.");
    return;
  }

  const parsed = parsePayload(rawInput);
  if (!parsed.bytes.length) {
    payloadError(response, 400, "No hex payload found in input. Paste compiler output or hex bytes.");
    return;
  }

  const report = buildDecompileReport(parsed);

  response.status(200).json({
    ok: true,
    ...report,
  });
}
