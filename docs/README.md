# docs

This folder is the project site, published with GitHub Pages at <https://asciosh.github.io/lumen-x/>
(Settings → Pages → *Deploy from a branch* → `main` → `/docs`).

- `index.html`: the live demo. It is a static page: it cannot compute anything, so every number and answer it shows
  is a real response of the app, saved as JSON in `data/`. `app.css`, `fonts/` and `favicon.svg` are the same as the dashboard's.
- `data/`: the exported responses (sales, forecast, explanations, example questions with their answers, reorder suggestions).
  To refresh them from a running backend: `python3 scripts/export_demo.py --product <id>` and commit.
- `demo/index.html`: redirects the old address (`/demo/`) to the new one.
- `banner.png`, `demo.png`, `api-docs.png`, `forecast_real.png`, `forecast.png`, `forecast_global.png`, `feature_importance.png`, `wape_by_family.png`: images used by the README and the link preview (`banner.png`).
