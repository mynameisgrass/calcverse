# Calcverse Next

A standalone Next.js version of Calcverse with expanded tools.

## Included Features

- Basic calculator with keyboard support
- Scientific evaluator with DEG/RAD mode
- Converter suite:
  - Length, weight, temperature, speed
  - Live currency conversion via free exchange-rate endpoint
- Math tools:
  - BMI checker
  - Percentage lab
  - Quadratic solver
- Utility lab:
  - CASIO-style equation solver from linear to quartic (supports x to x^4 forms)
  - Base64 encode/decode (UTF-8 safe)
  - Base32 encode/decode
  - URL encode/decode
  - SHA-256 generation and checksum verification
  - JWT inspector (decode header/payload and claim timing checks)
  - UUID + NanoID + time-based ID generator
  - JSON toolkit (format, minify, validate, diff)
  - Regex tester with match listing and group output
  - Matrix calculator (multiply, determinant, inverse)
- Embedded Desmos graphing panel
- Desmos preset expressions with one-click copy
- Local history saved in browser localStorage

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

## Free Hosting

### Vercel (recommended)

1. Push this folder to its own GitHub repository.
2. In Vercel, click Add New Project.
3. Import the repository.
4. Keep defaults and deploy.

### Runtime Requirements For FX Comp

- The FX compiler panel runs Python scripts from `ollama-discord-bot/fxesplus` through Next API routes.
- Ensure Python is available on the host machine.
- Optional: set `PYTHON_BIN` if your Python executable is not on the default command (`python` on Windows, `python3` on Linux/macOS).

## Notes

- Currency rates use `https://open.er-api.com/v6/latest/{BASE}`.
- Desmos interactive graph presets require `NEXT_PUBLIC_DESMOS_API_KEY`.
- Without that key, Desmos falls back to embed mode (copy expression + open Desmos).

## Good Next Upgrades

- Add JWT decoder + validator
- Add UUID and nanoid generator
- Add JSON formatter/minifier and diff viewer
- Add regex tester with live highlights
- Add matrix operations (inverse, determinant, multiplication)
- Add equation plotting controls around Desmos (preset functions)
