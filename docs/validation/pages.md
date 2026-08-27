# GitHub Pages validation

Date: 27 August 2026

Command:

```bash
GITHUB_ACTIONS=true VITE_DEMO_MODE=true VITE_API_URL='' \
  pnpm --filter @seeplusplus/web... build
```

Result: passed. `dist/index.html` references JavaScript and CSS under
`/SeePlusPlus/assets/`, matching the project Pages URL. The largest CodeMirror
chunk is approximately 526 kB before gzip / 172 kB gzip; application, graph and
UI dependencies are split into separate chunks.

Automated browser screenshot validation could not run in the authoring
environment because no browser binary was installed and the browser download
endpoint timed out. CI remains responsible for the final deployed smoke check.
