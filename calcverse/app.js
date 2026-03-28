const tabs = Array.from(document.querySelectorAll(".tab"));
const switchablePanels = Array.from(document.querySelectorAll("main .panel:not(.history-panel)"));

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.panelTarget;

    tabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });

    switchablePanels.forEach((panel) => {
      const isActive = panel.id === target;
      panel.classList.toggle("active", isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    });
  });
});

const HISTORY_KEY = "calcverse-history-v1";
const historyList = document.getElementById("history-list");
const historyClearButton = document.getElementById("history-clear");
let historyItems = loadHistory();

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!historyItems.length) {
    const empty = document.createElement("li");
    empty.textContent = "No calculations yet.";
    historyList.appendChild(empty);
    return;
  }

  for (const item of historyItems) {
    const row = document.createElement("li");
    row.textContent = "[" + item.source + "] " + item.expression + " = " + item.result;
    historyList.appendChild(row);
  }
}

function addHistory(source, expression, result) {
  const entry = {
    source,
    expression,
    result,
    at: Date.now(),
  };

  historyItems.unshift(entry);
  historyItems = historyItems.slice(0, 20);
  persistHistory();
  renderHistory();
}

historyClearButton.addEventListener("click", () => {
  historyItems = [];
  persistHistory();
  renderHistory();
});

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
    throw new Error("Factorial input too large.");
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

function createTrig(angleMode) {
  const toRadians = (value) => (angleMode === "deg" ? (value * Math.PI) / 180 : value);
  const fromRadians = (value) => (angleMode === "deg" ? (value * 180) / Math.PI : value);

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
  let expr = rawInput.replace(/\u00d7/g, "*").replace(/\u00f7/g, "/");
  expr = expr.replace(/\^/g, "**");
  expr = replaceFactorialSyntax(expr);

  expr = expr
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

  return expr;
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

function evaluateExpression(rawInput, angleMode = "deg") {
  const source = String(rawInput || "").trim();
  if (!source) {
    throw new Error("Expression is empty.");
  }

  assertSafeExpression(source);
  const expression = normalizeExpression(source);
  validateIdentifiers(expression);

  const evaluator = new Function("trig", "fact", "return (" + expression + ");");
  const result = evaluator(createTrig(angleMode), factorial);

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Math error.");
  }

  return result;
}

const basicExpressionEl = document.getElementById("basic-expression");
const basicResultEl = document.getElementById("basic-result");
const basicKeypad = document.getElementById("basic-keypad");

let basicExpression = "";
let lastAnswer = 0;

function isOperator(char) {
  return ["+", "-", "*", "/", "%"].includes(char);
}

function appendBasicValue(value) {
  if (value === ".") {
    const currentToken = basicExpression.split(/[+\-*/%()]/).pop() || "";
    if (currentToken.includes(".")) {
      return;
    }
  }

  if (isOperator(value)) {
    if (!basicExpression && value !== "-") {
      return;
    }

    const last = basicExpression.at(-1);
    if (last && isOperator(last)) {
      basicExpression = basicExpression.slice(0, -1);
    }
  }

  basicExpression += value;
  updateBasicDisplay();
}

function updateBasicDisplay() {
  basicExpressionEl.textContent = basicExpression || "0";

  if (!basicExpression) {
    basicResultEl.textContent = "0";
    return;
  }

  try {
    const preview = evaluateExpression(basicExpression, "deg");
    basicResultEl.textContent = formatNumber(preview);
  } catch {
    basicResultEl.textContent = "...";
  }
}

function evaluateBasicExpression() {
  if (!basicExpression) return;

  try {
    const value = evaluateExpression(basicExpression, "deg");
    const formatted = formatNumber(value);
    addHistory("Basic", basicExpression, formatted);
    lastAnswer = value;
    basicExpression = formatted;
    basicExpressionEl.textContent = basicExpression;
    basicResultEl.textContent = formatted;
  } catch {
    basicResultEl.textContent = "Error";
  }
}

basicKeypad.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const { value, action } = target.dataset;

  if (action === "clear") {
    basicExpression = "";
    updateBasicDisplay();
    return;
  }

  if (action === "delete") {
    basicExpression = basicExpression.slice(0, -1);
    updateBasicDisplay();
    return;
  }

  if (action === "evaluate") {
    evaluateBasicExpression();
    return;
  }

  if (action === "ans") {
    const ansText = formatNumber(lastAnswer);
    basicExpression += ansText;
    updateBasicDisplay();
    return;
  }

  if (value) {
    appendBasicValue(value);
  }
});

window.addEventListener("keydown", (event) => {
  const activePanel = document.querySelector("main .panel.active");
  if (!activePanel || activePanel.id !== "basic-panel") {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    evaluateBasicExpression();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    basicExpression = basicExpression.slice(0, -1);
    updateBasicDisplay();
    return;
  }

  if (event.key === "Escape") {
    basicExpression = "";
    updateBasicDisplay();
    return;
  }

  if (/^[0-9.]$/.test(event.key) || isOperator(event.key) || ["(", ")"].includes(event.key)) {
    appendBasicValue(event.key);
  }
});

const scienceInput = document.getElementById("science-input");
const sciencePad = document.getElementById("science-pad");
const scienceEvalButton = document.getElementById("science-eval");
const scienceClearButton = document.getElementById("science-clear");
const scienceResult = document.getElementById("science-result");
const modeDegButton = document.getElementById("mode-deg");
const modeRadButton = document.getElementById("mode-rad");
let scientificAngleMode = "deg";

modeDegButton.addEventListener("click", () => {
  scientificAngleMode = "deg";
  modeDegButton.classList.add("active");
  modeRadButton.classList.remove("active");
});

modeRadButton.addEventListener("click", () => {
  scientificAngleMode = "rad";
  modeRadButton.classList.add("active");
  modeDegButton.classList.remove("active");
});

function insertIntoScienceInput(text) {
  const start = scienceInput.selectionStart ?? scienceInput.value.length;
  const end = scienceInput.selectionEnd ?? scienceInput.value.length;
  const before = scienceInput.value.slice(0, start);
  const after = scienceInput.value.slice(end);
  scienceInput.value = before + text + after;
  const nextPos = start + text.length;
  scienceInput.focus();
  scienceInput.setSelectionRange(nextPos, nextPos);
}

sciencePad.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const insert = target.dataset.insert;
  if (!insert) return;
  insertIntoScienceInput(insert);
});

function evaluateScientificExpression() {
  const source = scienceInput.value.trim();
  if (!source) {
    scienceResult.textContent = "Result: -";
    return;
  }

  try {
    const value = evaluateExpression(source, scientificAngleMode);
    const formatted = formatNumber(value);
    scienceResult.textContent = "Result: " + formatted;
    lastAnswer = value;
    addHistory("Scientific", source, formatted);
  } catch (error) {
    scienceResult.textContent = "Result: Error";
  }
}

scienceEvalButton.addEventListener("click", evaluateScientificExpression);
scienceClearButton.addEventListener("click", () => {
  scienceInput.value = "";
  scienceResult.textContent = "Result: -";
  scienceInput.focus();
});

scienceInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    evaluateScientificExpression();
  }
});

const convertCategory = document.getElementById("convert-category");
const convertInput = document.getElementById("convert-input");
const convertFrom = document.getElementById("convert-from");
const convertTo = document.getElementById("convert-to");
const convertSwap = document.getElementById("convert-swap");
const convertOutput = document.getElementById("convert-output");

const converterMap = {
  length: {
    units: {
      m: {
        label: "Meter (m)",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      km: {
        label: "Kilometer (km)",
        toBase: (v) => v * 1000,
        fromBase: (v) => v / 1000,
      },
      cm: {
        label: "Centimeter (cm)",
        toBase: (v) => v / 100,
        fromBase: (v) => v * 100,
      },
      mi: {
        label: "Mile (mi)",
        toBase: (v) => v * 1609.344,
        fromBase: (v) => v / 1609.344,
      },
      ft: {
        label: "Foot (ft)",
        toBase: (v) => v * 0.3048,
        fromBase: (v) => v / 0.3048,
      },
      in: {
        label: "Inch (in)",
        toBase: (v) => v * 0.0254,
        fromBase: (v) => v / 0.0254,
      },
    },
  },
  weight: {
    units: {
      kg: {
        label: "Kilogram (kg)",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      g: {
        label: "Gram (g)",
        toBase: (v) => v / 1000,
        fromBase: (v) => v * 1000,
      },
      lb: {
        label: "Pound (lb)",
        toBase: (v) => v * 0.45359237,
        fromBase: (v) => v / 0.45359237,
      },
      oz: {
        label: "Ounce (oz)",
        toBase: (v) => v * 0.028349523125,
        fromBase: (v) => v / 0.028349523125,
      },
    },
  },
  temperature: {
    units: {
      c: {
        label: "Celsius (C)",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      f: {
        label: "Fahrenheit (F)",
        toBase: (v) => ((v - 32) * 5) / 9,
        fromBase: (v) => (v * 9) / 5 + 32,
      },
      k: {
        label: "Kelvin (K)",
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15,
      },
    },
  },
  speed: {
    units: {
      "m/s": {
        label: "Meters per second (m/s)",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      "km/h": {
        label: "Kilometers per hour (km/h)",
        toBase: (v) => v / 3.6,
        fromBase: (v) => v * 3.6,
      },
      mph: {
        label: "Miles per hour (mph)",
        toBase: (v) => v * 0.44704,
        fromBase: (v) => v / 0.44704,
      },
      knot: {
        label: "Knot (kn)",
        toBase: (v) => v * 0.514444,
        fromBase: (v) => v / 0.514444,
      },
    },
  },
};

function populateUnitSelects() {
  const category = convertCategory.value;
  const units = converterMap[category].units;
  const keys = Object.keys(units);

  convertFrom.innerHTML = "";
  convertTo.innerHTML = "";

  keys.forEach((key, index) => {
    const fromOption = document.createElement("option");
    fromOption.value = key;
    fromOption.textContent = units[key].label;

    const toOption = document.createElement("option");
    toOption.value = key;
    toOption.textContent = units[key].label;

    convertFrom.appendChild(fromOption);
    convertTo.appendChild(toOption);

    if (index === 1) {
      convertTo.value = key;
    }
  });

  if (keys.length > 1) {
    convertTo.value = keys[1];
  }
}

function runConversion() {
  const category = convertCategory.value;
  const units = converterMap[category].units;
  const fromUnit = units[convertFrom.value];
  const toUnit = units[convertTo.value];
  const numericValue = Number.parseFloat(convertInput.value);

  if (!Number.isFinite(numericValue)) {
    convertOutput.textContent = "Converted value: Enter a valid number.";
    return;
  }

  const baseValue = fromUnit.toBase(numericValue);
  const convertedValue = toUnit.fromBase(baseValue);
  const formatted = formatNumber(convertedValue);

  convertOutput.textContent = "Converted value: " + formatted + " " + convertTo.value;
}

convertCategory.addEventListener("change", () => {
  populateUnitSelects();
  runConversion();
});

[convertInput, convertFrom, convertTo].forEach((el) => {
  el.addEventListener("input", runConversion);
  el.addEventListener("change", runConversion);
});

convertSwap.addEventListener("click", () => {
  const currentFrom = convertFrom.value;
  convertFrom.value = convertTo.value;
  convertTo.value = currentFrom;
  runConversion();
});

const bmiWeight = document.getElementById("bmi-weight");
const bmiHeight = document.getElementById("bmi-height");
const bmiCalc = document.getElementById("bmi-calc");
const bmiOutput = document.getElementById("bmi-output");

bmiCalc.addEventListener("click", () => {
  const weight = Number.parseFloat(bmiWeight.value);
  const heightCm = Number.parseFloat(bmiHeight.value);

  if (!(weight > 0) || !(heightCm > 0)) {
    bmiOutput.textContent = "BMI: Please enter valid values.";
    return;
  }

  const heightM = heightCm / 100;
  const bmi = weight / (heightM * heightM);
  let label = "Normal";

  if (bmi < 18.5) label = "Underweight";
  else if (bmi < 25) label = "Normal";
  else if (bmi < 30) label = "Overweight";
  else label = "Obesity";

  bmiOutput.textContent = "BMI: " + formatNumber(bmi) + " (" + label + ")";
});

const percentX = document.getElementById("percent-x");
const percentY = document.getElementById("percent-y");
const percentCalc = document.getElementById("percent-calc");
const percentOutput = document.getElementById("percent-output");

percentCalc.addEventListener("click", () => {
  const x = Number.parseFloat(percentX.value);
  const y = Number.parseFloat(percentY.value);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    percentOutput.textContent = "Result: Please enter valid numbers.";
    return;
  }

  const percentOfY = (x / 100) * y;
  const xAsPercentOfY = y === 0 ? null : (x / y) * 100;

  if (xAsPercentOfY === null) {
    percentOutput.textContent = "Result: " + x + "% of " + y + " = " + formatNumber(percentOfY) + " | x/y undefined";
    return;
  }

  percentOutput.textContent =
    "Result: " +
    x +
    "% of " +
    y +
    " = " +
    formatNumber(percentOfY) +
    " | " +
    x +
    " is " +
    formatNumber(xAsPercentOfY) +
    "% of " +
    y;
});

const quadA = document.getElementById("quad-a");
const quadB = document.getElementById("quad-b");
const quadC = document.getElementById("quad-c");
const quadCalc = document.getElementById("quad-calc");
const quadOutput = document.getElementById("quad-output");

quadCalc.addEventListener("click", () => {
  const a = Number.parseFloat(quadA.value);
  const b = Number.parseFloat(quadB.value);
  const c = Number.parseFloat(quadC.value);

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    quadOutput.textContent = "Roots: Please enter valid coefficients.";
    return;
  }

  if (a === 0) {
    if (b === 0) {
      quadOutput.textContent = "Roots: Not a valid equation.";
      return;
    }

    const linearRoot = -c / b;
    quadOutput.textContent = "Roots: Linear root x = " + formatNumber(linearRoot);
    return;
  }

  const discriminant = b * b - 4 * a * c;

  if (discriminant > 0) {
    const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    quadOutput.textContent =
      "Roots: x1 = " + formatNumber(x1) + ", x2 = " + formatNumber(x2);
    return;
  }

  if (discriminant === 0) {
    const x = -b / (2 * a);
    quadOutput.textContent = "Roots: x = " + formatNumber(x) + " (double root)";
    return;
  }

  const real = -b / (2 * a);
  const imaginary = Math.sqrt(-discriminant) / (2 * a);
  quadOutput.textContent =
    "Roots: " +
    formatNumber(real) +
    " + " +
    formatNumber(imaginary) +
    "i, " +
    formatNumber(real) +
    " - " +
    formatNumber(imaginary) +
    "i";
});

populateUnitSelects();
runConversion();
updateBasicDisplay();
renderHistory();
