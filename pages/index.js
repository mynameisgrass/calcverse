import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

const HISTORY_KEY = "calcverse-next-history-v2";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const NANOID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
const NUMBER_TOKEN_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

const TAB_ITEMS = [
  { id: "basic", label: "Basic" },
  { id: "scientific", label: "Scientific" },
  { id: "converter", label: "Converter" },
  { id: "fxcomp", label: "FX Comp" },
  { id: "math-tools", label: "Math Tools" },
  { id: "utilities", label: "Utilities Pro" },
  { id: "desmos", label: "Desmos" },
];

const FX_MODELS_FALLBACK = [
  {
    id: "580vnx",
    label: "fx-580VN X",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
    available: true,
  },
  {
    id: "580vnx-emu",
    label: "fx-580VN X (emu)",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
    available: true,
  },
  {
    id: "570esp",
    label: "fx-570ES PLUS",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
    available: true,
  },
  {
    id: "82espa",
    label: "fx-82ES PLUS A",
    formats: ["hex", "key"],
    targets: ["none", "overflow", "loader"],
    defaultFormat: "hex",
    defaultTarget: "overflow",
    available: true,
  },
  {
    id: "991cnx",
    label: "fx-991CN X",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
    available: true,
  },
  {
    id: "991cnx-emu",
    label: "fx-991CN X (emu)",
    formats: ["hex", "key"],
    targets: ["none"],
    defaultFormat: "hex",
    defaultTarget: "none",
    available: true,
  },
];

const DESMOS_API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || "";
const DESMOS_INTERACTIVE_ENABLED = Boolean(DESMOS_API_KEY);

const DESMOS_PRESETS = [
  { name: "Parabola", expression: "y=x^2" },
  { name: "Trig", expression: "y=sin(x)" },
  { name: "Circle", expression: "x^2+y^2=25" },
  { name: "Cubic", expression: "y=x^3-4x" },
  { name: "Wave Mix", expression: "y=sin(x)+0.5cos(3x)" },
  { name: "Quartic", expression: "y=x^4-6x^2+3" },
];

const STATIC_CONVERTERS = {
  length: {
    label: "Length",
    units: {
      m: { label: "Meter (m)", toBase: (v) => v, fromBase: (v) => v },
      km: { label: "Kilometer (km)", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      cm: { label: "Centimeter (cm)", toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      mi: { label: "Mile (mi)", toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
      ft: { label: "Foot (ft)", toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      in: { label: "Inch (in)", toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    },
  },
  weight: {
    label: "Weight",
    units: {
      kg: { label: "Kilogram (kg)", toBase: (v) => v, fromBase: (v) => v },
      g: { label: "Gram (g)", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      lb: { label: "Pound (lb)", toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237 },
      oz: { label: "Ounce (oz)", toBase: (v) => v * 0.028349523125, fromBase: (v) => v / 0.028349523125 },
    },
  },
  temperature: {
    label: "Temperature",
    units: {
      c: { label: "Celsius (C)", toBase: (v) => v, fromBase: (v) => v },
      f: { label: "Fahrenheit (F)", toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      k: { label: "Kelvin (K)", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    },
  },
  speed: {
    label: "Speed",
    units: {
      "m/s": { label: "Meters per second (m/s)", toBase: (v) => v, fromBase: (v) => v },
      "km/h": { label: "Kilometers per hour (km/h)", toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
      mph: { label: "Miles per hour (mph)", toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
      knot: { label: "Knot (kn)", toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
    },
  },
};

const BASIC_KEYS = [
  { label: "C", action: "clear", variant: "action" },
  { label: "DEL", action: "delete", variant: "action" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
  { label: "/", value: "/", variant: "operator" },
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
  { label: "x", value: "*", variant: "operator" },
  { label: "%", value: "%", variant: "operator" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "-", value: "-", variant: "operator" },
  { label: "Ans", action: "ans" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "+", value: "+", variant: "operator" },
  { label: "=", action: "evaluate", variant: "equals" },
  { label: "0", value: "0", variant: "zero" },
  { label: ".", value: "." },
];

const SCIENCE_CHIPS = [
  "sin(",
  "cos(",
  "tan(",
  "asin(",
  "acos(",
  "atan(",
  "sqrt(",
  "abs(",
  "ln(",
  "log(",
  "^",
  "!",
  "pi",
  "e",
  "(",
  ")",
];

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  const abs = Math.abs(value);
  if ((abs > 0 && abs < 1e-6) || abs >= 1e12) {
    return value.toExponential(6);
  }

  return Number.parseFloat(value.toFixed(10)).toString();
}

function factorial(n) {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error("Factorial only supports non-negative integers.");
  }

  if (n > 170) {
    throw new Error("Factorial input is too large.");
  }

  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

function replaceFactorialSyntax(expression) {
  let updated = expression;
  while (true) {
    const next = updated.replace(/(\d+(?:\.\d+)?|\([^()]*\))!/g, "fact($1)");
    if (next === updated) {
      break;
    }
    updated = next;
  }

  if (updated.includes("!")) {
    throw new Error("Unsupported factorial placement.");
  }

  return updated;
}

function createTrig(mode) {
  const toRadians = (value) => (mode === "deg" ? (value * Math.PI) / 180 : value);
  const fromRadians = (value) => (mode === "deg" ? (value * 180) / Math.PI : value);

  return {
    sin: (value) => Math.sin(toRadians(value)),
    cos: (value) => Math.cos(toRadians(value)),
    tan: (value) => Math.tan(toRadians(value)),
    asin: (value) => fromRadians(Math.asin(value)),
    acos: (value) => fromRadians(Math.acos(value)),
    atan: (value) => fromRadians(Math.atan(value)),
  };
}

function assertSafeExpression(rawInput) {
  const allowedRaw = /^[0-9+\-*/().,%!\s^a-zA-Z]*$/;
  if (!allowedRaw.test(rawInput)) {
    throw new Error("Expression contains unsupported characters.");
  }
}

function normalizeExpression(rawInput) {
  let expression = rawInput.replace(/\u00d7/g, "*").replace(/\u00f7/g, "/");
  expression = expression.replace(/\^/g, "**");
  expression = replaceFactorialSyntax(expression);

  expression = expression
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\be\b/g, "Math.E")
    .replace(/\bsin\(/gi, "trig.sin(")
    .replace(/\bcos\(/gi, "trig.cos(")
    .replace(/\btan\(/gi, "trig.tan(")
    .replace(/\basin\(/gi, "trig.asin(")
    .replace(/\bacos\(/gi, "trig.acos(")
    .replace(/\batan\(/gi, "trig.atan(")
    .replace(/\bsqrt\(/gi, "Math.sqrt(")
    .replace(/\babs\(/gi, "Math.abs(")
    .replace(/\bln\(/gi, "Math.log(")
    .replace(/\blog\(/gi, "Math.log10(");

  return expression;
}

function validateIdentifiers(expression) {
  const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const allowedIdentifiers = new Set([
    "Math",
    "PI",
    "E",
    "trig",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sqrt",
    "abs",
    "log",
    "log10",
    "fact",
  ]);

  for (const identifier of identifiers) {
    if (!allowedIdentifiers.has(identifier)) {
      throw new Error("Unsupported function or token.");
    }
  }

  const allowedFinalChars = /^[0-9+\-*/().,%\sA-Za-z_]*$/;
  if (!allowedFinalChars.test(expression)) {
    throw new Error("Invalid expression format.");
  }
}

function evaluateExpression(rawInput, mode = "deg") {
  const source = String(rawInput || "").trim();
  if (!source) {
    throw new Error("Expression is empty.");
  }

  assertSafeExpression(source);
  const expression = normalizeExpression(source);
  validateIdentifiers(expression);

  const evaluator = new Function("trig", "fact", "return (" + expression + ");");
  const result = evaluator(createTrig(mode), factorial);

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Math error.");
  }

  return result;
}

function bytesToBinary(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
}

function binaryToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Utf8(text) {
  return btoa(bytesToBinary(new TextEncoder().encode(text)));
}

function decodeBase64Utf8(encoded) {
  const cleaned = encoded.trim();
  if (!cleaned) return "";
  return new TextDecoder().decode(binaryToBytes(atob(cleaned)));
}

function encodeBase32Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  while (output.length % 8 !== 0) {
    output += "=";
  }

  return output;
}

function decodeBase32Utf8(input) {
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  if (!cleaned) return "";

  let bits = 0;
  let value = 0;
  const output = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid Base32 string.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new TextDecoder().decode(new Uint8Array(output));
}

async function sha256Hex(text) {
  const payload = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64UrlUtf8(segment) {
  const base = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
  return new TextDecoder().decode(binaryToBytes(atob(padded)));
}

function safeRandomValues(byteLength) {
  const bytes = new Uint8Array(byteLength);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function generateNanoId(size = 21) {
  const bytes = safeRandomValues(size);
  let output = "";

  for (let index = 0; index < size; index += 1) {
    output += NANOID_ALPHABET[bytes[index] % NANOID_ALPHABET.length];
  }

  return output;
}

function generateUuidFallback() {
  const bytes = safeRandomValues(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return generateUuidFallback();
}

function normalizeRegexFlags(rawFlags) {
  const allowed = new Set(["d", "g", "i", "m", "s", "u", "y"]);
  const unique = [];

  for (const flag of rawFlags) {
    if (!allowed.has(flag)) continue;
    if (!unique.includes(flag)) unique.push(flag);
  }

  return unique.join("");
}

function flattenJson(value, path = "", target = {}) {
  if (Array.isArray(value)) {
    if (!value.length) {
      target[path || "(root)"] = "[]";
      return target;
    }

    value.forEach((item, index) => {
      const childPath = path ? path + "[" + index + "]" : "[" + index + "]";
      flattenJson(item, childPath, target);
    });

    return target;
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);

    if (!keys.length) {
      target[path || "(root)"] = "{}";
      return target;
    }

    for (const key of keys) {
      const childPath = path ? path + "." + key : key;
      flattenJson(value[key], childPath, target);
    }

    return target;
  }

  target[path || "(root)"] = JSON.stringify(value);
  return target;
}

function complex(re, im = 0) {
  return { re, im };
}

function cAdd(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

function cSub(a, b) {
  return complex(a.re - b.re, a.im - b.im);
}

function cMul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function cDiv(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator === 0) {
    return complex(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }

  return complex((a.re * b.re + a.im * b.im) / denominator, (a.im * b.re - a.re * b.im) / denominator);
}

function cAbs(z) {
  return Math.hypot(z.re, z.im);
}

function polyEvalComplex(coeffDesc, z) {
  let result = complex(coeffDesc[0], 0);

  for (let index = 1; index < coeffDesc.length; index += 1) {
    result = cAdd(cMul(result, z), complex(coeffDesc[index], 0));
  }

  return result;
}

function durandKerner(coeffDesc) {
  const degree = coeffDesc.length - 1;

  if (degree === 1) {
    return [complex(-coeffDesc[1] / coeffDesc[0], 0)];
  }

  const leading = coeffDesc[0];
  const monic = coeffDesc.map((value) => value / leading);
  let roots = Array.from({ length: degree }, (_, index) => {
    const angle = (2 * Math.PI * index) / degree;
    return complex(0.7 * Math.cos(angle) + 0.4, 0.7 * Math.sin(angle) + 0.9);
  });

  for (let iteration = 0; iteration < 140; iteration += 1) {
    let maxDelta = 0;
    const updatedRoots = [];

    for (let i = 0; i < degree; i += 1) {
      let denominator = complex(1, 0);

      for (let j = 0; j < degree; j += 1) {
        if (i === j) continue;
        denominator = cMul(denominator, cSub(roots[i], roots[j]));
      }

      if (cAbs(denominator) < 1e-14) {
        denominator = complex(1e-14, 1e-14);
      }

      const value = polyEvalComplex(monic, roots[i]);
      const delta = cDiv(value, denominator);
      const nextRoot = cSub(roots[i], delta);
      maxDelta = Math.max(maxDelta, cAbs(cSub(nextRoot, roots[i])));
      updatedRoots.push(nextRoot);
    }

    roots = updatedRoots;

    if (maxDelta < 1e-12) {
      break;
    }
  }

  return roots;
}

function groupRoots(roots) {
  const sorted = [...roots].sort((a, b) => {
    if (a.re !== b.re) return a.re - b.re;
    return a.im - b.im;
  });

  const groups = [];

  for (const root of sorted) {
    let group = null;

    for (const candidate of groups) {
      if (cAbs(cSub(candidate.root, root)) < 1e-5) {
        group = candidate;
        break;
      }
    }

    if (!group) {
      groups.push({ root: root, multiplicity: 1 });
      continue;
    }

    const nextMultiplicity = group.multiplicity + 1;
    group.root = complex(
      (group.root.re * group.multiplicity + root.re) / nextMultiplicity,
      (group.root.im * group.multiplicity + root.im) / nextMultiplicity
    );
    group.multiplicity = nextMultiplicity;
  }

  return groups;
}

function formatComplexNumber(z) {
  const re = Math.abs(z.re) < 1e-9 ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-9 ? 0 : z.im;

  if (im === 0) {
    return formatNumber(re);
  }

  if (re === 0) {
    return formatNumber(im) + "i";
  }

  return formatNumber(re) + (im >= 0 ? " + " : " - ") + formatNumber(Math.abs(im)) + "i";
}

function parsePolynomialSide(side) {
  if (!side) {
    throw new Error("Equation side is empty.");
  }

  let expression = side.replace(/\s+/g, "").replace(/\*/g, "").replace(/−/g, "-");

  if (!/^[0-9xX+\-^.]*$/.test(expression)) {
    throw new Error("Only numbers, x, +, -, and ^ are allowed.");
  }

  if (!expression.startsWith("+") && !expression.startsWith("-")) {
    expression = "+" + expression;
  }

  const terms = expression.match(/[+-][^+-]+/g);
  if (!terms || !terms.length) {
    throw new Error("Invalid equation format.");
  }

  const coefficients = [0, 0, 0, 0, 0];

  for (const rawTerm of terms) {
    const sign = rawTerm[0] === "-" ? -1 : 1;
    const term = rawTerm.slice(1).replace(/X/g, "x");

    if (!term) {
      throw new Error("Invalid empty term.");
    }

    if (term.includes("x")) {
      const xIndex = term.indexOf("x");
      const coefficientText = term.slice(0, xIndex);
      const remainder = term.slice(xIndex + 1);

      let coefficient = 1;
      if (coefficientText) {
        if (!NUMBER_TOKEN_PATTERN.test(coefficientText)) {
          throw new Error("Invalid coefficient: " + coefficientText);
        }
        coefficient = Number.parseFloat(coefficientText);
      }

      let power = 1;
      if (remainder) {
        if (!remainder.startsWith("^")) {
          throw new Error("Invalid power format in term: " + rawTerm);
        }

        const powerText = remainder.slice(1);
        if (!/^\d+$/.test(powerText)) {
          throw new Error("Invalid power in term: " + rawTerm);
        }

        power = Number.parseInt(powerText, 10);
      }

      if (power < 0 || power > 4) {
        throw new Error("Supported powers are from x^0 to x^4.");
      }

      coefficients[power] += sign * coefficient;
      continue;
    }

    if (!NUMBER_TOKEN_PATTERN.test(term)) {
      throw new Error("Invalid constant term: " + rawTerm);
    }

    coefficients[0] += sign * Number.parseFloat(term);
  }

  return coefficients;
}

function solvePolynomialEquation(rawEquation) {
  const source = String(rawEquation || "").trim();
  if (!source) {
    throw new Error("Please enter an equation.");
  }

  const parts = source.split("=");
  if (parts.length !== 2) {
    throw new Error("Use exactly one '=' sign in your equation.");
  }

  const left = parsePolynomialSide(parts[0]);
  const right = parsePolynomialSide(parts[1]);
  const coefficients = left.map((value, index) => {
    const next = value - right[index];
    return Math.abs(next) < 1e-12 ? 0 : next;
  });

  let degree = 4;
  while (degree > 0 && Math.abs(coefficients[degree]) < 1e-12) {
    degree -= 1;
  }

  if (degree === 0) {
    if (Math.abs(coefficients[0]) < 1e-12) {
      return { kind: "identity" };
    }

    return { kind: "inconsistent" };
  }

  const coeffDesc = [];
  for (let power = degree; power >= 0; power -= 1) {
    coeffDesc.push(coefficients[power]);
  }

  const roots = durandKerner(coeffDesc);
  const grouped = groupRoots(roots);

  return {
    kind: "roots",
    degree,
    grouped,
  };
}

function parseMatrix(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Matrix input is empty.");
  }

  const rows = trimmed
    .split(/\n+/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) =>
      row
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
          const value = Number.parseFloat(token);
          if (!Number.isFinite(value)) {
            throw new Error("Invalid matrix value: " + token);
          }
          return value;
        })
    );

  if (!rows.length) {
    throw new Error("Matrix input is empty.");
  }

  const width = rows[0].length;
  if (!width) {
    throw new Error("Matrix rows must contain values.");
  }

  for (const row of rows) {
    if (row.length !== width) {
      throw new Error("Matrix rows must have the same number of columns.");
    }
  }

  return rows;
}

function matrixToText(matrix) {
  return matrix.map((row) => row.map((value) => formatNumber(value)).join("\t")).join("\n");
}

function multiplyMatrices(a, b) {
  if (a[0].length !== b.length) {
    throw new Error("Cannot multiply: columns of A must match rows of B.");
  }

  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }

  return result;
}

function determinant(matrix) {
  const n = matrix.length;
  if (n !== matrix[0].length) {
    throw new Error("Determinant requires a square matrix.");
  }

  const data = matrix.map((row) => [...row]);
  let det = 1;
  let sign = 1;

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(data[row][col]) > Math.abs(data[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(data[pivot][col]) < 1e-12) {
      return 0;
    }

    if (pivot !== col) {
      const temp = data[col];
      data[col] = data[pivot];
      data[pivot] = temp;
      sign *= -1;
    }

    const pivotValue = data[col][col];
    det *= pivotValue;

    for (let row = col + 1; row < n; row += 1) {
      const factor = data[row][col] / pivotValue;
      for (let c = col; c < n; c += 1) {
        data[row][c] -= factor * data[col][c];
      }
    }
  }

  return det * sign;
}

function inverseMatrix(matrix) {
  const n = matrix.length;
  if (n !== matrix[0].length) {
    throw new Error("Inverse requires a square matrix.");
  }

  const left = matrix.map((row) => [...row]);
  const right = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(left[row][col]) > Math.abs(left[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(left[pivot][col]) < 1e-12) {
      throw new Error("Matrix is singular and cannot be inverted.");
    }

    if (pivot !== col) {
      const tempLeft = left[col];
      left[col] = left[pivot];
      left[pivot] = tempLeft;

      const tempRight = right[col];
      right[col] = right[pivot];
      right[pivot] = tempRight;
    }

    const pivotValue = left[col][col];
    for (let c = 0; c < n; c += 1) {
      left[col][c] /= pivotValue;
      right[col][c] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = left[row][col];
      for (let c = 0; c < n; c += 1) {
        left[row][c] -= factor * left[col][c];
        right[row][c] -= factor * right[col][c];
      }
    }
  }

  return right;
}

function isOperator(char) {
  return ["+", "-", "*", "/", "%"].includes(char);
}

function ConverterUnitOption({ unitKey, unitLabel }) {
  return <option value={unitKey}>{unitLabel}</option>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("basic");

  const [historyItems, setHistoryItems] = useState([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);

  const [basicExpression, setBasicExpression] = useState("");
  const [basicPreview, setBasicPreview] = useState("0");
  const [lastAnswer, setLastAnswer] = useState(0);

  const [scienceInput, setScienceInput] = useState("");
  const [scienceMode, setScienceMode] = useState("deg");
  const [scienceResult, setScienceResult] = useState("Result: -");

  const [convertCategory, setConvertCategory] = useState("length");
  const [convertValue, setConvertValue] = useState("1");
  const [convertFrom, setConvertFrom] = useState("m");
  const [convertTo, setConvertTo] = useState("km");
  const [currencyBase, setCurrencyBase] = useState("USD");
  const [currencyRates, setCurrencyRates] = useState({ USD: 1 });
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState("");
  const [currencyUpdatedAt, setCurrencyUpdatedAt] = useState("");

  const [bmiWeight, setBmiWeight] = useState("");
  const [bmiHeight, setBmiHeight] = useState("");
  const [bmiOutput, setBmiOutput] = useState("BMI: -");

  const [percentX, setPercentX] = useState("");
  const [percentY, setPercentY] = useState("");
  const [percentOutput, setPercentOutput] = useState("Result: -");

  const [quadA, setQuadA] = useState("");
  const [quadB, setQuadB] = useState("");
  const [quadC, setQuadC] = useState("");
  const [quadOutput, setQuadOutput] = useState("Roots: -");

  const [codecInput, setCodecInput] = useState("");
  const [codecOutput, setCodecOutput] = useState("Output appears here.");

  const [shaInput, setShaInput] = useState("");
  const [shaOutput, setShaOutput] = useState("SHA-256: -");
  const [shaTarget, setShaTarget] = useState("");
  const [shaCheckOutput, setShaCheckOutput] = useState("Check: -");
  const [shaBusy, setShaBusy] = useState(false);

  const [equationInput, setEquationInput] = useState("x+2=36");
  const [equationOutput, setEquationOutput] = useState("Solution appears here.");

  const [jwtInput, setJwtInput] = useState("");
  const [jwtHeader, setJwtHeader] = useState("Header: -");
  const [jwtPayload, setJwtPayload] = useState("Payload: -");
  const [jwtStatus, setJwtStatus] = useState("Status: -");

  const [idCount, setIdCount] = useState("5");
  const [idOutput, setIdOutput] = useState("Generated IDs appear here.");

  const [jsonInput, setJsonInput] = useState("{\n  \"name\": \"calcverse\"\n}");
  const [jsonCompareInput, setJsonCompareInput] = useState("{\n  \"name\": \"calcverse\",\n  \"version\": 2\n}");
  const [jsonOutput, setJsonOutput] = useState("JSON output appears here.");

  const [regexPattern, setRegexPattern] = useState("x[0-9]+");
  const [regexFlags, setRegexFlags] = useState("g");
  const [regexInput, setRegexInput] = useState("x1 x20 x300 y2");
  const [regexOutput, setRegexOutput] = useState("Regex result appears here.");

  const [matrixAInput, setMatrixAInput] = useState("1 2\n3 4");
  const [matrixBInput, setMatrixBInput] = useState("5 6\n7 8");
  const [matrixOutput, setMatrixOutput] = useState("Matrix output appears here.");

  const [fxModels, setFxModels] = useState(FX_MODELS_FALLBACK);
  const [fxBackendStatus, setFxBackendStatus] = useState("Detecting fx compiler backend...");
  const [fxModel, setFxModel] = useState("auto");
  const [fxFormat, setFxFormat] = useState("hex");
  const [fxTarget, setFxTarget] = useState("overflow");
  const [fxProgram, setFxProgram] = useState("# Paste fx compiler program here\n");
  const [fxOutput, setFxOutput] = useState("FX compiler output appears here.");
  const [fxBusy, setFxBusy] = useState(false);

  const [desmosExpression, setDesmosExpression] = useState(DESMOS_PRESETS[0].expression);
  const [desmosMessage, setDesmosMessage] = useState(
    DESMOS_INTERACTIVE_ENABLED
      ? "Loading Desmos graph..."
      : "Interactive graph disabled (missing NEXT_PUBLIC_DESMOS_API_KEY)."
  );
  const desmosHostRef = useRef(null);
  const desmosCalculatorRef = useRef(null);

  const selectedFxModel = useMemo(() => fxModels.find((model) => model.id === fxModel) || null, [fxModels, fxModel]);
  const fxFormatOptions = selectedFxModel ? selectedFxModel.formats : ["hex", "key"];
  const fxTargetOptions = selectedFxModel ? selectedFxModel.targets : ["none", "overflow", "loader"];

  useEffect(() => {
    if (!fxFormatOptions.includes(fxFormat)) {
      setFxFormat(fxFormatOptions[0]);
    }
  }, [fxFormat, fxFormatOptions]);

  useEffect(() => {
    if (!fxTargetOptions.includes(fxTarget)) {
      setFxTarget(fxTargetOptions[0]);
    }
  }, [fxTarget, fxTargetOptions]);

  useEffect(() => {
    let cancelled = false;

    async function loadFxModels() {
      try {
        const response = await fetch("https://casaserver.tailddbdaf.ts.net:8443/fx/api");
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Failed to load fx compiler metadata.");
        }

        if (cancelled) return;
        const models = Array.isArray(payload.models) ? payload.models : [];
        if (models.length) {
          setFxModels(models);
          const availableCount = models.filter((model) => model.available).length;
          setFxBackendStatus(
            availableCount
              ? `FX backend ready. ${availableCount} model(s) available.`
              : "FX backend reachable, but no model script is available."
          );
        }
      } catch (error) {
        if (cancelled) return;
        setFxBackendStatus("FX backend unavailable. " + (error instanceof Error ? error.message : "Unknown error."));
      }
    }

    loadFxModels();

    return () => {
      cancelled = true;
    };
  }, []);

  function initializeDesmosCalculator() {
    if (typeof window === "undefined") return false;
    if (desmosCalculatorRef.current || !desmosHostRef.current) return false;
    if (!window.Desmos || !window.Desmos.GraphingCalculator) return false;

    const calculator = window.Desmos.GraphingCalculator(desmosHostRef.current, {
      expressions: true,
      settingsMenu: true,
      zoomButtons: true,
    });

    desmosCalculatorRef.current = calculator;
    calculator.setExpression({ id: "main", latex: desmosExpression || "y=x" });
    setDesmosMessage("Graph ready. Pick a preset or type your own expression.");
    return true;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!DESMOS_INTERACTIVE_ENABLED) return;

    let mounted = true;
    let scriptElement = null;

    const handleScriptLoad = () => {
      if (!mounted) return;
      initializeDesmosCalculator();
    };

    const handleScriptError = () => {
      if (!mounted) return;
      setDesmosMessage("Failed to load Desmos API. Use Open Desmos as fallback.");
    };

    if (window.Desmos && window.Desmos.GraphingCalculator) {
      initializeDesmosCalculator();
    } else {
      scriptElement = document.querySelector('script[data-desmos-api="1"]');

      if (!scriptElement) {
        scriptElement = document.createElement("script");
        scriptElement.src =
          "https://www.desmos.com/api/v1.11/calculator.js?apiKey=" + encodeURIComponent(DESMOS_API_KEY);
        scriptElement.async = true;
        scriptElement.setAttribute("data-desmos-api", "1");
        document.body.appendChild(scriptElement);
      }

      scriptElement.addEventListener("load", handleScriptLoad);
      scriptElement.addEventListener("error", handleScriptError);
    }

    return () => {
      mounted = false;

      if (scriptElement) {
        scriptElement.removeEventListener("load", handleScriptLoad);
        scriptElement.removeEventListener("error", handleScriptError);
      }

      if (desmosCalculatorRef.current) {
        desmosCalculatorRef.current.destroy();
        desmosCalculatorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!DESMOS_INTERACTIVE_ENABLED) return;
    if (activeTab !== "desmos") return;
    initializeDesmosCalculator();
  }, [activeTab]);

  useEffect(() => {
    if (!DESMOS_INTERACTIVE_ENABLED) return;
    const calculator = desmosCalculatorRef.current;
    if (!calculator) return;

    const latex = desmosExpression.trim();
    if (!latex) {
      calculator.removeExpression({ id: "main" });
      return;
    }

    calculator.setExpression({ id: "main", latex });
  }, [desmosExpression]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawHistory = window.localStorage.getItem(HISTORY_KEY);
      if (!rawHistory) {
        setHistoryHydrated(true);
        return;
      }

      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        setHistoryItems(parsed);
      }
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!historyHydrated || typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
  }, [historyItems, historyHydrated]);

  function addHistory(source, expression, result) {
    setHistoryItems((previous) => [{ source, expression, result, at: Date.now() }, ...previous].slice(0, 40));
  }

  useEffect(() => {
    if (!basicExpression) {
      setBasicPreview("0");
      return;
    }

    try {
      const preview = evaluateExpression(basicExpression, "deg");
      setBasicPreview(formatNumber(preview));
    } catch {
      setBasicPreview("...");
    }
  }, [basicExpression]);

  function appendBasicValue(value) {
    setBasicExpression((previous) => {
      if (value === ".") {
        const currentToken = previous.split(/[+\-*/%()]/).pop() || "";
        if (currentToken.includes(".")) {
          return previous;
        }
      }

      if (isOperator(value)) {
        if (!previous && value !== "-") {
          return previous;
        }

        const last = previous.at(-1);
        if (last && isOperator(last)) {
          return previous.slice(0, -1) + value;
        }
      }

      return previous + value;
    });
  }

  function evaluateBasic() {
    if (!basicExpression) return;

    try {
      const value = evaluateExpression(basicExpression, "deg");
      const formatted = formatNumber(value);
      addHistory("Basic", basicExpression, formatted);
      setLastAnswer(value);
      setBasicExpression(formatted);
      setBasicPreview(formatted);
    } catch {
      setBasicPreview("Error");
    }
  }

  function handleBasicKeyPress(key) {
    if (key.action === "clear") {
      setBasicExpression("");
      return;
    }

    if (key.action === "delete") {
      setBasicExpression((previous) => previous.slice(0, -1));
      return;
    }

    if (key.action === "evaluate") {
      evaluateBasic();
      return;
    }

    if (key.action === "ans") {
      setBasicExpression((previous) => previous + formatNumber(lastAnswer));
      return;
    }

    if (key.value) {
      appendBasicValue(key.value);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (activeTab !== "basic") {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        evaluateBasic();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setBasicExpression((previous) => previous.slice(0, -1));
        return;
      }

      if (event.key === "Escape") {
        setBasicExpression("");
        return;
      }

      if (/^[0-9.]$/.test(event.key) || isOperator(event.key) || ["(", ")"].includes(event.key)) {
        appendBasicValue(event.key);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, basicExpression, lastAnswer]);

  function evaluateScience() {
    if (!scienceInput.trim()) {
      setScienceResult("Result: -");
      return;
    }

    try {
      const value = evaluateExpression(scienceInput, scienceMode);
      const formatted = formatNumber(value);
      setScienceResult("Result: " + formatted);
      setLastAnswer(value);
      addHistory("Scientific", scienceInput, formatted);
    } catch {
      setScienceResult("Result: Error");
    }
  }

  function insertScienceToken(token) {
    setScienceInput((previous) => previous + token);
  }

  useEffect(() => {
    if (convertCategory !== "currency") {
      return;
    }

    let cancelled = false;

    async function fetchCurrencyRates() {
      setCurrencyLoading(true);
      setCurrencyError("");

      try {
        const response = await fetch("https://open.er-api.com/v6/latest/" + encodeURIComponent(currencyBase));
        if (!response.ok) {
          throw new Error("Unable to fetch rates right now.");
        }

        const data = await response.json();
        if (data.result !== "success" || !data.rates) {
          throw new Error("Rate provider returned an unexpected response.");
        }

        if (cancelled) return;
        const normalizedRates = { [currencyBase]: 1, ...data.rates };
        setCurrencyRates(normalizedRates);
        setCurrencyUpdatedAt(data.time_last_update_utc || "");
      } catch (error) {
        if (cancelled) return;
        setCurrencyError(error instanceof Error ? error.message : "Rate fetch failed.");
      } finally {
        if (!cancelled) {
          setCurrencyLoading(false);
        }
      }
    }

    fetchCurrencyRates();

    return () => {
      cancelled = true;
    };
  }, [convertCategory, currencyBase]);

  const converterUnits = useMemo(() => {
    if (convertCategory !== "currency") {
      return STATIC_CONVERTERS[convertCategory].units;
    }

    const sortedCurrencyCodes = Object.keys(currencyRates).sort();
    const units = {};

    for (const code of sortedCurrencyCodes) {
      units[code] = {
        label: code + " currency",
      };
    }

    return units;
  }, [convertCategory, currencyRates]);

  useEffect(() => {
    const keys = Object.keys(converterUnits);
    if (!keys.length) {
      return;
    }

    if (!keys.includes(convertFrom)) {
      setConvertFrom(keys[0]);
    }

    if (!keys.includes(convertTo)) {
      setConvertTo(keys[1] || keys[0]);
      return;
    }

    if (convertFrom === convertTo && keys.length > 1) {
      setConvertTo(keys[1]);
    }
  }, [converterUnits, convertFrom, convertTo]);

  const conversionOutput = useMemo(() => {
    const numericValue = Number.parseFloat(convertValue);

    if (!Number.isFinite(numericValue)) {
      return "Converted value: Enter a valid number.";
    }

    if (!convertFrom || !convertTo) {
      return "Converted value: Select units.";
    }

    if (convertCategory === "currency") {
      if (currencyLoading) {
        return "Converted value: Fetching live exchange rates...";
      }

      if (currencyError) {
        return "Converted value: " + currencyError;
      }

      const fromRate = currencyRates[convertFrom];
      const toRate = currencyRates[convertTo];

      if (!fromRate || !toRate) {
        return "Converted value: Rates are not available for these currencies.";
      }

      const valueInBase = numericValue / fromRate;
      const converted = valueInBase * toRate;
      return "Converted value: " + formatNumber(converted) + " " + convertTo;
    }

    const fromUnit = STATIC_CONVERTERS[convertCategory].units[convertFrom];
    const toUnit = STATIC_CONVERTERS[convertCategory].units[convertTo];

    if (!fromUnit || !toUnit) {
      return "Converted value: Select valid units.";
    }

    const baseValue = fromUnit.toBase(numericValue);
    const converted = toUnit.fromBase(baseValue);
    return "Converted value: " + formatNumber(converted) + " " + convertTo;
  }, [convertCategory, convertValue, convertFrom, convertTo, currencyLoading, currencyError, currencyRates]);

  function swapUnits() {
    setConvertFrom(convertTo);
    setConvertTo(convertFrom);
  }

  function calculateBmi() {
    const weight = Number.parseFloat(bmiWeight);
    const heightCm = Number.parseFloat(bmiHeight);

    if (!(weight > 0) || !(heightCm > 0)) {
      setBmiOutput("BMI: Please enter valid values.");
      return;
    }

    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);

    let category = "Normal";
    if (bmi < 18.5) category = "Underweight";
    else if (bmi < 25) category = "Normal";
    else if (bmi < 30) category = "Overweight";
    else category = "Obesity";

    setBmiOutput("BMI: " + formatNumber(bmi) + " (" + category + ")");
  }

  function calculatePercentage() {
    const x = Number.parseFloat(percentX);
    const y = Number.parseFloat(percentY);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setPercentOutput("Result: Please enter valid numbers.");
      return;
    }

    const xPercentOfY = (x / 100) * y;

    if (y === 0) {
      setPercentOutput("Result: " + x + "% of " + y + " = " + formatNumber(xPercentOfY) + " | x/y undefined");
      return;
    }

    const xAsPercentOfY = (x / y) * 100;
    setPercentOutput(
      "Result: " +
        x +
        "% of " +
        y +
        " = " +
        formatNumber(xPercentOfY) +
        " | " +
        x +
        " is " +
        formatNumber(xAsPercentOfY) +
        "% of " +
        y
    );
  }

  function solveQuadratic() {
    const a = Number.parseFloat(quadA);
    const b = Number.parseFloat(quadB);
    const c = Number.parseFloat(quadC);

    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      setQuadOutput("Roots: Please enter valid coefficients.");
      return;
    }

    if (a === 0) {
      if (b === 0) {
        setQuadOutput("Roots: Not a valid equation.");
        return;
      }

      const linearRoot = -c / b;
      setQuadOutput("Roots: Linear root x = " + formatNumber(linearRoot));
      return;
    }

    const discriminant = b * b - 4 * a * c;

    if (discriminant > 0) {
      const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
      const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
      setQuadOutput("Roots: x1 = " + formatNumber(x1) + ", x2 = " + formatNumber(x2));
      return;
    }

    if (discriminant === 0) {
      const x = -b / (2 * a);
      setQuadOutput("Roots: x = " + formatNumber(x) + " (double root)");
      return;
    }

    const real = -b / (2 * a);
    const imaginary = Math.sqrt(-discriminant) / (2 * a);
    setQuadOutput(
      "Roots: " +
        formatNumber(real) +
        " + " +
        formatNumber(imaginary) +
        "i, " +
        formatNumber(real) +
        " - " +
        formatNumber(imaginary) +
        "i"
    );
  }

  function runCodec(action) {
    try {
      switch (action) {
        case "base64-encode":
          setCodecOutput(encodeBase64Utf8(codecInput));
          break;
        case "base64-decode":
          setCodecOutput(decodeBase64Utf8(codecInput));
          break;
        case "base32-encode":
          setCodecOutput(encodeBase32Utf8(codecInput));
          break;
        case "base32-decode":
          setCodecOutput(decodeBase32Utf8(codecInput));
          break;
        case "url-encode":
          setCodecOutput(encodeURIComponent(codecInput));
          break;
        case "url-decode":
          setCodecOutput(decodeURIComponent(codecInput));
          break;
        default:
          setCodecOutput("Unknown action.");
      }
    } catch (error) {
      setCodecOutput("Error: " + (error instanceof Error ? error.message : "Unable to process this input."));
    }
  }

  async function generateSha256() {
    setShaBusy(true);
    try {
      const hash = await sha256Hex(shaInput);
      setShaOutput("SHA-256: " + hash);
    } catch (error) {
      setShaOutput("SHA-256: Error");
      setShaCheckOutput("Check: " + (error instanceof Error ? error.message : "Hashing failed."));
    } finally {
      setShaBusy(false);
    }
  }

  async function checkSha256() {
    const expected = shaTarget.trim().toLowerCase();
    if (!expected) {
      setShaCheckOutput("Check: Paste a SHA-256 hash to compare.");
      return;
    }

    if (!/^[a-f0-9]{64}$/i.test(expected)) {
      setShaCheckOutput("Check: Hash format should be 64 hex characters.");
      return;
    }

    setShaBusy(true);
    try {
      const actual = await sha256Hex(shaInput);
      setShaCheckOutput(actual === expected ? "Check: MATCH" : "Check: NO MATCH");
    } catch (error) {
      setShaCheckOutput("Check: " + (error instanceof Error ? error.message : "Check failed."));
    } finally {
      setShaBusy(false);
    }
  }

  function solveEquationInput() {
    try {
      const result = solvePolynomialEquation(equationInput);

      if (result.kind === "identity") {
        setEquationOutput("Infinite solutions: both sides are identical.");
        addHistory("Equation", equationInput, "Infinite solutions");
        return;
      }

      if (result.kind === "inconsistent") {
        setEquationOutput("No solution: equation reduces to a contradiction.");
        addHistory("Equation", equationInput, "No solution");
        return;
      }

      const lines = [];
      lines.push("Degree detected: " + result.degree);

      if (result.grouped.length === 1 && result.grouped[0].multiplicity === 1) {
        lines.push("x = " + formatComplexNumber(result.grouped[0].root));
      } else {
        let index = 1;
        for (const group of result.grouped) {
          lines.push(
            "x" +
              index +
              " = " +
              formatComplexNumber(group.root) +
              (group.multiplicity > 1 ? " (multiplicity " + group.multiplicity + ")" : "")
          );
          index += 1;
        }
      }

      const output = lines.join("\n");
      setEquationOutput(output);
      addHistory("Equation", equationInput, lines[1] || "Solved");
    } catch (error) {
      setEquationOutput("Error: " + (error instanceof Error ? error.message : "Could not solve equation."));
    }
  }

  function decodeJwtToken() {
    const token = jwtInput.trim();
    if (!token) {
      setJwtHeader("Header: -");
      setJwtPayload("Payload: -");
      setJwtStatus("Status: Enter a JWT token.");
      return;
    }

    try {
      const parts = token.split(".");
      if (parts.length < 2) {
        throw new Error("JWT must contain at least header.payload");
      }

      const headerObj = JSON.parse(decodeBase64UrlUtf8(parts[0]));
      const payloadObj = JSON.parse(decodeBase64UrlUtf8(parts[1]));

      setJwtHeader(JSON.stringify(headerObj, null, 2));
      setJwtPayload(JSON.stringify(payloadObj, null, 2));

      const now = Math.floor(Date.now() / 1000);
      const statusLines = [];
      statusLines.push("Signature section present: " + (parts[2] ? "Yes" : "No"));

      if (typeof payloadObj.exp === "number") {
        const expired = now >= payloadObj.exp;
        statusLines.push(
          "exp: " + new Date(payloadObj.exp * 1000).toISOString() + " (" + (expired ? "expired" : "active") + ")"
        );
      }

      if (typeof payloadObj.nbf === "number") {
        const allowed = now >= payloadObj.nbf;
        statusLines.push(
          "nbf: " + new Date(payloadObj.nbf * 1000).toISOString() + " (" + (allowed ? "usable" : "not yet") + ")"
        );
      }

      if (typeof payloadObj.iat === "number") {
        statusLines.push("iat: " + new Date(payloadObj.iat * 1000).toISOString());
      }

      if (!statusLines.length) {
        statusLines.push("Decoded successfully.");
      }

      setJwtStatus(statusLines.join("\n"));
    } catch (error) {
      setJwtHeader("Header: error");
      setJwtPayload("Payload: error");
      setJwtStatus("Status: " + (error instanceof Error ? error.message : "Unable to decode token."));
    }
  }

  function generateIdBatch() {
    const count = Math.max(1, Math.min(50, Number.parseInt(idCount || "1", 10) || 1));
    const lines = [];

    for (let index = 0; index < count; index += 1) {
      lines.push(
        "#" +
          (index + 1) +
          "\nUUID: " +
          generateUuid() +
          "\nNanoID: " +
          generateNanoId(21) +
          "\nTime ID: " +
          Date.now().toString(36) +
          "-" +
          generateNanoId(8)
      );
    }

    setIdOutput(lines.join("\n\n"));
  }

  function runJsonAction(action) {
    try {
      if (action === "format") {
        const parsed = JSON.parse(jsonInput);
        setJsonOutput(JSON.stringify(parsed, null, 2));
        return;
      }

      if (action === "minify") {
        const parsed = JSON.parse(jsonInput);
        setJsonOutput(JSON.stringify(parsed));
        return;
      }

      if (action === "validate") {
        JSON.parse(jsonInput);
        setJsonOutput("JSON is valid.");
        return;
      }

      if (action === "diff") {
        const leftObj = JSON.parse(jsonInput);
        const rightObj = JSON.parse(jsonCompareInput);

        const leftFlat = flattenJson(leftObj);
        const rightFlat = flattenJson(rightObj);
        const keys = Array.from(new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)])).sort();

        const lines = [];
        for (const key of keys) {
          if (!(key in leftFlat)) {
            lines.push("+ " + key + " = " + rightFlat[key]);
            continue;
          }

          if (!(key in rightFlat)) {
            lines.push("- " + key + " = " + leftFlat[key]);
            continue;
          }

          if (leftFlat[key] !== rightFlat[key]) {
            lines.push("~ " + key + " : " + leftFlat[key] + " -> " + rightFlat[key]);
          }
        }

        setJsonOutput(lines.length ? lines.join("\n") : "No differences.");
      }
    } catch (error) {
      setJsonOutput("Error: " + (error instanceof Error ? error.message : "Invalid JSON input."));
    }
  }

  function testRegex() {
    try {
      const flags = normalizeRegexFlags(regexFlags);
      const baseRegex = new RegExp(regexPattern, flags);
      const globalRegex = new RegExp(regexPattern, flags.includes("g") ? flags : flags + "g");

      const lines = [];
      lines.push("Pattern valid.");
      lines.push("Quick test: " + (baseRegex.test(regexInput) ? "matched" : "no match"));

      const matches = [];
      let match;
      let safety = 0;

      while ((match = globalRegex.exec(regexInput)) !== null && safety < 1000) {
        safety += 1;
        matches.push(match);
        if (match[0] === "") {
          globalRegex.lastIndex += 1;
        }
      }

      lines.push("Total matches: " + matches.length);

      matches.slice(0, 120).forEach((item, index) => {
        lines.push("#" + (index + 1) + " [" + item.index + ".." + (item.index + item[0].length) + "] \"" + item[0] + "\"");
        if (item.length > 1) {
          lines.push("  groups: " + item.slice(1).map((group) => String(group)).join(" | "));
        }
      });

      if (matches.length > 120) {
        lines.push("... truncated");
      }

      setRegexOutput(lines.join("\n"));
    } catch (error) {
      setRegexOutput("Error: " + (error instanceof Error ? error.message : "Invalid regex."));
    }
  }

  function runMatrixAction(action) {
    try {
      const matrixA = parseMatrix(matrixAInput);
      const matrixB = parseMatrix(matrixBInput);

      if (action === "multiply") {
        const result = multiplyMatrices(matrixA, matrixB);
        setMatrixOutput("A x B\n" + matrixToText(result));
        return;
      }

      if (action === "detA") {
        setMatrixOutput("det(A) = " + formatNumber(determinant(matrixA)));
        return;
      }

      if (action === "detB") {
        setMatrixOutput("det(B) = " + formatNumber(determinant(matrixB)));
        return;
      }

      if (action === "invA") {
        setMatrixOutput("A^-1\n" + matrixToText(inverseMatrix(matrixA)));
        return;
      }

      if (action === "invB") {
        setMatrixOutput("B^-1\n" + matrixToText(inverseMatrix(matrixB)));
      }
    } catch (error) {
      setMatrixOutput("Error: " + (error instanceof Error ? error.message : "Matrix operation failed."));
    }
  }

  async function compileFxProgram() {
    const program = fxProgram.trim();
    if (!program) {
      setFxOutput("Error: Program input is empty.");
      return;
    }

    setFxBusy(true);

    try {
      const response = await fetch("/fx/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: fxModel,
          format: fxFormat,
          target: fxTarget,
          program,
        }),
      });

      const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response from fx backend." }));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Compilation failed.");
      }

      const lines = [
        "Model: " + payload.model,
        "Format: " + payload.format,
        "Target: " + payload.target,
      ];

      if (payload.warnings) {
        lines.push("Warnings:\n" + payload.warnings);
      }

      lines.push("Output:\n" + (payload.output || "(empty output)"));
      setFxOutput(lines.join("\n\n"));
      addHistory("FXComp", payload.model + " " + payload.format + "/" + payload.target, "Compiled");
    } catch (error) {
      setFxOutput("Error: " + (error instanceof Error ? error.message : "Compilation failed."));
    } finally {
      setFxBusy(false);
    }
  }

  function applyDesmosExpression(customExpression) {
    const calculator = desmosCalculatorRef.current;
    const latex = (customExpression ?? desmosExpression).trim();

    if (!latex) {
      setDesmosMessage("Enter an expression like y=x^2.");
      return;
    }

    if (!DESMOS_INTERACTIVE_ENABLED) {
      setDesmosMessage("Interactive graph is disabled. Use Copy Expression + Open Desmos.");
      return;
    }

    if (!calculator) {
      setDesmosMessage("Desmos is still loading. Try again in a moment.");
      return;
    }

    calculator.setExpression({ id: "main", latex });
    setDesmosMessage("Applied to graph: " + latex);
  }

  function selectDesmosPreset(preset) {
    setDesmosExpression(preset.expression);
    if (DESMOS_INTERACTIVE_ENABLED) {
      applyDesmosExpression(preset.expression);
    } else {
      setDesmosMessage("Preset selected. Copy the expression and paste it in Desmos.");
    }
  }

  async function copyDesmosExpression() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(desmosExpression);
        setDesmosMessage("Expression copied to clipboard.");
      } else {
        setDesmosMessage("Clipboard not available in this browser.");
      }
    } catch {
      setDesmosMessage("Copy failed. You can manually copy the expression text.");
    }
  }

  return (
    <>
      <Head>
        <title>Calcverse Next - Ultimate Calculator</title>
        <meta
          name="description"
          content="All-in-one calculator with scientific mode, converters, currency rates, utilities, hashing tools, CASIO-style equation solving, and Desmos presets."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="bgLayer" aria-hidden="true" />
      <div className="gridOverlay" aria-hidden="true" />
      <div className="orb orbOne" aria-hidden="true" />
      <div className="orb orbTwo" aria-hidden="true" />
      <div className="orb orbThree" aria-hidden="true" />

      <div className="appShell">
        <header className="hero">
          <p className="eyebrow">Ultimate edition with CASIO-style equation solving</p>
          <h1>Calcverse Next</h1>
          <p className="subtitle">
            Calculator, scientific evaluator, smart converters, utility lab, and Desmos in one modern workspace.
          </p>

          <div className="tabBar" role="tablist" aria-label="Calcverse modules">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                className={"tabButton" + (activeTab === tab.id ? " active" : "")}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <main className="appGrid">
          <section className="panel mainPanel">
            {activeTab === "basic" ? (
              <div>
                <div className="panelHeader">
                  <h2>Basic Calculator</h2>
                  <p>Use buttons or keyboard for fast calculations.</p>
                </div>

                <div className="displayWrap">
                  <div className="expression">{basicExpression || "0"}</div>
                  <div className="result">{basicPreview}</div>
                </div>

                <div className="keypad">
                  {BASIC_KEYS.map((key, index) => (
                    <button
                      key={key.label + "-" + index}
                      className={
                        "keyButton" +
                        (key.variant ? " " + key.variant : "") +
                        (key.variant === "zero" ? " zero" : "")
                      }
                      type="button"
                      onClick={() => handleBasicKeyPress(key)}
                    >
                      {key.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === "scientific" ? (
              <div>
                <div className="panelHeader">
                  <h2>Scientific Evaluator</h2>
                  <p>Supports trig, powers, factorial, logs, and constants.</p>
                </div>

                <label className="fieldLabel" htmlFor="science-input">
                  Expression
                </label>
                <input
                  id="science-input"
                  className="textInput"
                  type="text"
                  value={scienceInput}
                  onChange={(event) => setScienceInput(event.target.value)}
                  placeholder="Example: sin(45) + sqrt(16) + 5!"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      evaluateScience();
                    }
                  }}
                />

                <div className="rowWrap">
                  <div className="modeToggle" role="group" aria-label="Angle mode">
                    <button
                      className={"modeButton" + (scienceMode === "deg" ? " active" : "")}
                      onClick={() => setScienceMode("deg")}
                      type="button"
                    >
                      DEG
                    </button>
                    <button
                      className={"modeButton" + (scienceMode === "rad" ? " active" : "")}
                      onClick={() => setScienceMode("rad")}
                      type="button"
                    >
                      RAD
                    </button>
                  </div>

                  <button className="primaryButton" onClick={evaluateScience} type="button">
                    Evaluate
                  </button>
                  <button
                    className="ghostButton"
                    onClick={() => {
                      setScienceInput("");
                      setScienceResult("Result: -");
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                </div>

                <div className="chipGrid">
                  {SCIENCE_CHIPS.map((chip) => (
                    <button key={chip} className="chipButton" onClick={() => insertScienceToken(chip)} type="button">
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="resultCard">{scienceResult}</div>
              </div>
            ) : null}

            {activeTab === "converter" ? (
              <div>
                <div className="panelHeader">
                  <h2>Converter Suite</h2>
                  <p>Length, weight, temperature, speed, and live currency rates.</p>
                </div>

                <div className="formGrid">
                  <div>
                    <label className="fieldLabel" htmlFor="convert-category">
                      Category
                    </label>
                    <select
                      id="convert-category"
                      className="selectInput"
                      value={convertCategory}
                      onChange={(event) => setConvertCategory(event.target.value)}
                    >
                      <option value="length">Length</option>
                      <option value="weight">Weight</option>
                      <option value="temperature">Temperature</option>
                      <option value="speed">Speed</option>
                      <option value="currency">Currency (Live)</option>
                    </select>
                  </div>

                  <div>
                    <label className="fieldLabel" htmlFor="convert-value">
                      Value
                    </label>
                    <input
                      id="convert-value"
                      className="textInput"
                      type="number"
                      value={convertValue}
                      onChange={(event) => setConvertValue(event.target.value)}
                    />
                  </div>

                  {convertCategory === "currency" ? (
                    <div>
                      <label className="fieldLabel" htmlFor="currency-base">
                        Rate Base
                      </label>
                      <select
                        id="currency-base"
                        className="selectInput"
                        value={currencyBase}
                        onChange={(event) => setCurrencyBase(event.target.value)}
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="JPY">JPY</option>
                        <option value="AUD">AUD</option>
                        <option value="CAD">CAD</option>
                        <option value="SGD">SGD</option>
                        <option value="VND">VND</option>
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label className="fieldLabel" htmlFor="convert-from">
                      From
                    </label>
                    <select
                      id="convert-from"
                      className="selectInput"
                      value={convertFrom}
                      onChange={(event) => setConvertFrom(event.target.value)}
                    >
                      {Object.entries(converterUnits).map(([unitKey, unitValue]) => (
                        <ConverterUnitOption key={unitKey} unitKey={unitKey} unitLabel={unitValue.label} />
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="fieldLabel" htmlFor="convert-to">
                      To
                    </label>
                    <select
                      id="convert-to"
                      className="selectInput"
                      value={convertTo}
                      onChange={(event) => setConvertTo(event.target.value)}
                    >
                      {Object.entries(converterUnits).map(([unitKey, unitValue]) => (
                        <ConverterUnitOption key={unitKey} unitKey={unitKey} unitLabel={unitValue.label} />
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rowWrap">
                  <button className="ghostButton" onClick={swapUnits} type="button">
                    Swap Units
                  </button>
                </div>

                {convertCategory === "currency" ? (
                  <p className="metaText">
                    {currencyUpdatedAt
                      ? "Rate timestamp: " + currencyUpdatedAt
                      : "Rate source: open.er-api.com (free endpoint)"}
                  </p>
                ) : null}

                <div className="resultCard">{conversionOutput}</div>
              </div>
            ) : null}

            {activeTab === "fxcomp" ? (
              <div>
                <div className="panelHeader">
                  <h2>FX Compiler Web</h2>
                  <p>
                    Reusing the fx/casio compiler strategy from your discord bot. This panel focuses on fxcomp only.
                  </p>
                </div>

                <div className="formGrid fxFormGrid">
                  <div>
                    <label className="fieldLabel" htmlFor="fx-model">
                      Model
                    </label>
                    <select
                      id="fx-model"
                      className="selectInput"
                      value={fxModel}
                      onChange={(event) => setFxModel(event.target.value)}
                    >
                      <option value="auto">Auto (try available models)</option>
                      {fxModels
                        .filter((model) => model.available)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="fieldLabel" htmlFor="fx-format">
                      Format
                    </label>
                    <select
                      id="fx-format"
                      className="selectInput"
                      value={fxFormat}
                      onChange={(event) => setFxFormat(event.target.value)}
                    >
                      {fxFormatOptions.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="fieldLabel" htmlFor="fx-target">
                      Target
                    </label>
                    <select
                      id="fx-target"
                      className="selectInput"
                      value={fxTarget}
                      onChange={(event) => setFxTarget(event.target.value)}
                    >
                      {fxTargetOptions.map((target) => (
                        <option key={target} value={target}>
                          {target}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="fieldLabel" htmlFor="fx-program">
                  FX Program Input
                </label>
                <textarea
                  id="fx-program"
                  className="textInput textArea monoArea fxProgramArea"
                  value={fxProgram}
                  onChange={(event) => setFxProgram(event.target.value)}
                  placeholder="Paste fx compiler program text here"
                />

                <div className="buttonWrap">
                  <button className="primaryButton" type="button" onClick={compileFxProgram} disabled={fxBusy}>
                    {fxBusy ? "Compiling..." : "Compile FX Program"}
                  </button>
                </div>

                <p className="metaText">{fxBackendStatus}</p>
                <pre className="codeBox fxOutputBox">{fxOutput}</pre>
              </div>
            ) : null}

            {activeTab === "math-tools" ? (
              <div>
                <div className="panelHeader">
                  <h2>Math Tools</h2>
                  <p>Handy mini tools for daily calculations.</p>
                </div>

                <div className="toolGrid">
                  <article className="toolCard">
                    <h3>BMI Checker</h3>
                    <label className="fieldLabel" htmlFor="bmi-weight">
                      Weight (kg)
                    </label>
                    <input
                      id="bmi-weight"
                      className="textInput"
                      type="number"
                      value={bmiWeight}
                      onChange={(event) => setBmiWeight(event.target.value)}
                      placeholder="65"
                    />
                    <label className="fieldLabel" htmlFor="bmi-height">
                      Height (cm)
                    </label>
                    <input
                      id="bmi-height"
                      className="textInput"
                      type="number"
                      value={bmiHeight}
                      onChange={(event) => setBmiHeight(event.target.value)}
                      placeholder="172"
                    />
                    <button className="primaryButton" type="button" onClick={calculateBmi}>
                      Calculate BMI
                    </button>
                    <p className="toolOutput">{bmiOutput}</p>
                  </article>

                  <article className="toolCard">
                    <h3>Percentage Lab</h3>
                    <label className="fieldLabel" htmlFor="percent-x">
                      X
                    </label>
                    <input
                      id="percent-x"
                      className="textInput"
                      type="number"
                      value={percentX}
                      onChange={(event) => setPercentX(event.target.value)}
                      placeholder="30"
                    />
                    <label className="fieldLabel" htmlFor="percent-y">
                      Y
                    </label>
                    <input
                      id="percent-y"
                      className="textInput"
                      type="number"
                      value={percentY}
                      onChange={(event) => setPercentY(event.target.value)}
                      placeholder="120"
                    />
                    <button className="primaryButton" type="button" onClick={calculatePercentage}>
                      Calculate
                    </button>
                    <p className="toolOutput">{percentOutput}</p>
                  </article>

                  <article className="toolCard">
                    <h3>Quadratic Solver</h3>
                    <label className="fieldLabel" htmlFor="quad-a">
                      a
                    </label>
                    <input
                      id="quad-a"
                      className="textInput"
                      type="number"
                      value={quadA}
                      onChange={(event) => setQuadA(event.target.value)}
                      placeholder="1"
                    />
                    <label className="fieldLabel" htmlFor="quad-b">
                      b
                    </label>
                    <input
                      id="quad-b"
                      className="textInput"
                      type="number"
                      value={quadB}
                      onChange={(event) => setQuadB(event.target.value)}
                      placeholder="-3"
                    />
                    <label className="fieldLabel" htmlFor="quad-c">
                      c
                    </label>
                    <input
                      id="quad-c"
                      className="textInput"
                      type="number"
                      value={quadC}
                      onChange={(event) => setQuadC(event.target.value)}
                      placeholder="2"
                    />
                    <button className="primaryButton" type="button" onClick={solveQuadratic}>
                      Solve
                    </button>
                    <p className="toolOutput">{quadOutput}</p>
                  </article>
                </div>
              </div>
            ) : null}

            {activeTab === "utilities" ? (
              <div>
                <div className="panelHeader">
                  <h2>Utilities Pro</h2>
                  <p>
                    Real toolset: equation solving from x to x^4, encoding, checksum, JWT, IDs, JSON, regex, and matrix math.
                  </p>
                </div>

                <div className="utilityStack">
                  <article className="utilityCard">
                    <h3>Encode / Decode Lab</h3>
                    <label className="fieldLabel" htmlFor="codec-input">
                      Input Text
                    </label>
                    <textarea
                      id="codec-input"
                      className="textInput textArea monoArea"
                      value={codecInput}
                      onChange={(event) => setCodecInput(event.target.value)}
                      placeholder="Type or paste text"
                    />

                    <div className="buttonWrap">
                      <button className="ghostButton" type="button" onClick={() => runCodec("base64-encode")}>
                        Base64 Encode
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runCodec("base64-decode")}>
                        Base64 Decode
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runCodec("base32-encode")}>
                        Base32 Encode
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runCodec("base32-decode")}>
                        Base32 Decode
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runCodec("url-encode")}>
                        URL Encode
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runCodec("url-decode")}>
                        URL Decode
                      </button>
                    </div>

                    <pre className="codeBox">{codecOutput}</pre>
                  </article>

                  <article className="utilityCard">
                    <h3>SHA-256 and Checksum</h3>
                    <label className="fieldLabel" htmlFor="sha-input">
                      Input Text
                    </label>
                    <textarea
                      id="sha-input"
                      className="textInput textArea monoArea"
                      value={shaInput}
                      onChange={(event) => setShaInput(event.target.value)}
                      placeholder="Text to hash"
                    />

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={generateSha256} disabled={shaBusy}>
                        {shaBusy ? "Hashing..." : "Generate SHA-256"}
                      </button>
                    </div>

                    <pre className="codeBox">{shaOutput}</pre>

                    <label className="fieldLabel" htmlFor="sha-target">
                      Compare Against Hash
                    </label>
                    <input
                      id="sha-target"
                      className="textInput monoArea"
                      type="text"
                      value={shaTarget}
                      onChange={(event) => setShaTarget(event.target.value)}
                      placeholder="Paste expected SHA-256 hash"
                    />

                    <div className="buttonWrap">
                      <button className="ghostButton" type="button" onClick={checkSha256} disabled={shaBusy}>
                        Verify Hash
                      </button>
                    </div>

                    <p className="toolOutput">{shaCheckOutput}</p>
                  </article>

                  <article className="utilityCard wideCard">
                    <h3>Equation Solver (CASIO style)</h3>
                    <p className="metaText compact">
                      Supports forms from x+2=36 to ax^4+bx^3+cx^2+dx+e=f. Variable must be x.
                    </p>

                    <label className="fieldLabel" htmlFor="equation-input">
                      Equation
                    </label>
                    <input
                      id="equation-input"
                      className="textInput monoArea"
                      type="text"
                      value={equationInput}
                      onChange={(event) => setEquationInput(event.target.value)}
                      placeholder="Example: 2x^4-3x^2+5x-8=0"
                    />

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={solveEquationInput}>
                        Solve Equation
                      </button>
                    </div>

                    <pre className="codeBox">{equationOutput}</pre>
                  </article>

                  <article className="utilityCard">
                    <h3>JWT Inspector</h3>
                    <label className="fieldLabel" htmlFor="jwt-input">
                      JWT Token
                    </label>
                    <textarea
                      id="jwt-input"
                      className="textInput textArea monoArea"
                      value={jwtInput}
                      onChange={(event) => setJwtInput(event.target.value)}
                      placeholder="Paste header.payload.signature"
                    />

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={decodeJwtToken}>
                        Decode JWT
                      </button>
                    </div>

                    <pre className="codeBox">{jwtHeader}</pre>
                    <pre className="codeBox">{jwtPayload}</pre>
                    <pre className="codeBox">{jwtStatus}</pre>
                  </article>

                  <article className="utilityCard">
                    <h3>ID Generator</h3>
                    <label className="fieldLabel" htmlFor="id-count">
                      Count (1-50)
                    </label>
                    <input
                      id="id-count"
                      className="textInput"
                      type="number"
                      min="1"
                      max="50"
                      value={idCount}
                      onChange={(event) => setIdCount(event.target.value)}
                    />

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={generateIdBatch}>
                        Generate UUID + NanoID
                      </button>
                    </div>

                    <pre className="codeBox">{idOutput}</pre>
                  </article>

                  <article className="utilityCard wideCard">
                    <h3>JSON Toolkit</h3>

                    <div className="splitGrid">
                      <div>
                        <label className="fieldLabel" htmlFor="json-input">
                          JSON Input A
                        </label>
                        <textarea
                          id="json-input"
                          className="textInput textArea monoArea"
                          value={jsonInput}
                          onChange={(event) => setJsonInput(event.target.value)}
                        />
                      </div>

                      <div>
                        <label className="fieldLabel" htmlFor="json-input-b">
                          JSON Input B (for diff)
                        </label>
                        <textarea
                          id="json-input-b"
                          className="textInput textArea monoArea"
                          value={jsonCompareInput}
                          onChange={(event) => setJsonCompareInput(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="buttonWrap">
                      <button className="ghostButton" type="button" onClick={() => runJsonAction("format")}>
                        Format
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runJsonAction("minify")}>
                        Minify
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runJsonAction("validate")}>
                        Validate
                      </button>
                      <button className="primaryButton" type="button" onClick={() => runJsonAction("diff")}>
                        Diff A vs B
                      </button>
                    </div>

                    <pre className="codeBox">{jsonOutput}</pre>
                  </article>

                  <article className="utilityCard wideCard">
                    <h3>Regex Tester</h3>

                    <div className="splitGrid regexMetaGrid">
                      <div>
                        <label className="fieldLabel" htmlFor="regex-pattern">
                          Pattern
                        </label>
                        <input
                          id="regex-pattern"
                          className="textInput monoArea"
                          type="text"
                          value={regexPattern}
                          onChange={(event) => setRegexPattern(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="fieldLabel" htmlFor="regex-flags">
                          Flags
                        </label>
                        <input
                          id="regex-flags"
                          className="textInput monoArea"
                          type="text"
                          value={regexFlags}
                          onChange={(event) => setRegexFlags(event.target.value)}
                          placeholder="gim"
                        />
                      </div>
                    </div>

                    <label className="fieldLabel" htmlFor="regex-input">
                      Input Text
                    </label>
                    <textarea
                      id="regex-input"
                      className="textInput textArea monoArea"
                      value={regexInput}
                      onChange={(event) => setRegexInput(event.target.value)}
                    />

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={testRegex}>
                        Test Regex
                      </button>
                    </div>

                    <pre className="codeBox">{regexOutput}</pre>
                  </article>

                  <article className="utilityCard wideCard">
                    <h3>Matrix Calculator</h3>
                    <p className="metaText compact">Enter rows on new lines, values separated by spaces or commas.</p>

                    <div className="splitGrid">
                      <div>
                        <label className="fieldLabel" htmlFor="matrix-a">
                          Matrix A
                        </label>
                        <textarea
                          id="matrix-a"
                          className="textInput textArea monoArea"
                          value={matrixAInput}
                          onChange={(event) => setMatrixAInput(event.target.value)}
                        />
                      </div>

                      <div>
                        <label className="fieldLabel" htmlFor="matrix-b">
                          Matrix B
                        </label>
                        <textarea
                          id="matrix-b"
                          className="textInput textArea monoArea"
                          value={matrixBInput}
                          onChange={(event) => setMatrixBInput(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="buttonWrap">
                      <button className="primaryButton" type="button" onClick={() => runMatrixAction("multiply")}>
                        A x B
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runMatrixAction("detA")}>
                        det(A)
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runMatrixAction("detB")}>
                        det(B)
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runMatrixAction("invA")}>
                        A^-1
                      </button>
                      <button className="ghostButton" type="button" onClick={() => runMatrixAction("invB")}>
                        B^-1
                      </button>
                    </div>

                    <pre className="codeBox">{matrixOutput}</pre>
                  </article>
                </div>
              </div>
            ) : null}

            {activeTab === "desmos" ? (
              <div>
                <div className="panelHeader">
                  <h2>Desmos Graphing</h2>
                  <p>Graph functions directly in an embedded Desmos calculator and use quick presets.</p>
                </div>

                <div className="presetGrid">
                  {DESMOS_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      className="chipButton"
                      type="button"
                      onClick={() => selectDesmosPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                <label className="fieldLabel" htmlFor="desmos-expression">
                  Preset Expression
                </label>
                <input
                  id="desmos-expression"
                  className="textInput monoArea"
                  type="text"
                  value={desmosExpression}
                  onChange={(event) => setDesmosExpression(event.target.value)}
                />

                <div className="buttonWrap">
                  <button
                    className="primaryButton"
                    type="button"
                    onClick={() => applyDesmosExpression()}
                    disabled={!DESMOS_INTERACTIVE_ENABLED}
                  >
                    Apply to Graph
                  </button>
                  <button className="primaryButton" type="button" onClick={copyDesmosExpression}>
                    Copy Expression
                  </button>
                  <a className="ghostButton inlineButtonLink" href="https://www.desmos.com/calculator" target="_blank" rel="noreferrer">
                    Open Desmos
                  </a>
                </div>

                <p className="metaText">{desmosMessage}</p>

                <div className="desmosWrap">
                  {DESMOS_INTERACTIVE_ENABLED ? (
                    <div className="desmosCanvas" ref={desmosHostRef} />
                  ) : (
                    <iframe
                      className="desmosEmbedFrame"
                      src="https://www.desmos.com/calculator?embed"
                      title="Desmos Graphing Calculator"
                      loading="lazy"
                      allow="fullscreen"
                    />
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="panel historyPanel">
            <div className="historyHead">
              <h2>History</h2>
              <button className="ghostButton" type="button" onClick={() => setHistoryItems([])}>
                Clear
              </button>
            </div>
            <p className="metaText">Saved locally in your browser.</p>

            <ul className="historyList">
              {!historyItems.length ? <li>No calculations yet.</li> : null}
              {historyItems.map((item) => (
                <li key={item.at + item.expression + item.result}>
                  <div className="historySource">[{item.source}]</div>
                  <div className="historyExpr">{item.expression}</div>
                  <div className="historyRes">= {item.result}</div>
                </li>
              ))}
            </ul>
          </aside>
        </main>

        <footer className="siteFooter">
          <p>Built for Vercel deployment with a server-backed FX compiler API.</p>
        </footer>
      </div>
    </>
  );
}
