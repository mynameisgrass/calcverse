# Calcverse

A standalone all-in-one calculator web app with:

- Basic calculator with keyboard support
- Scientific expression evaluator (trig, logs, powers, factorial, constants)
- Unit converter (length, weight, temperature, speed)
- Quick math tools (BMI, percentage, quadratic solver)
- Local history (stored in browser localStorage)

## Local Run

This app is static, so no build step is required.

1. Open index.html directly in your browser, or
2. Use any static server extension/tool if you want live reload.

## Free Hosting Options

### Vercel (free)

Best for fast deploys and custom domains.

1. Put this folder in its own GitHub repo (recommended: calcverse).
2. In Vercel, click Add New Project.
3. Import the repo.
4. Framework Preset: Other.
5. Build Command: leave empty.
6. Output Directory: leave empty (root).
7. Deploy.

### GitHub Pages (free)

Best for simple static hosting from GitHub.

1. Push these files to a GitHub repo.
2. Go to repo Settings > Pages.
3. Source: Deploy from a branch.
4. Branch: main, folder: / (root).
5. Save and wait for publish.

Your site will be available at:
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/

## Suggested Repo Structure

If your current workspace has multiple projects, keep this app in a separate repo for easy deployment:

- calcverse/
  - index.html
  - styles.css
  - app.js
  - README.md
