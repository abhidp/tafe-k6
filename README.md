# TAFE NSW - Course Search Load Test

Simulates 5 concurrent browser users searching for courses on [tafensw.edu.au](https://www.tafensw.edu.au) using k6 browser module.

## Deployment Status

[![GitHub Pages](https://github.com/abhidp/tafe-k6/actions/workflows/load-test.yml/badge.svg)](https://github.com/abhidp/tafe-k6/actions/workflows/load-test.yml)
[![Load Test Results](https://img.shields.io/badge/results-latest-blue)](https://abhidp.github.io/tafe-k6/)

A Report is available at [https://abhidp.github.io/tafe-k6/](https://abhidp.github.io/tafe-k6/) (deployed via GitHub Actions on every run)

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v0.46+
- Chromium is bundled with k6 — no separate install needed

## Project Structure

```
├── config.json
├── data/courses.json
├── pages/
│   ├── home-page.js
│   └── search-results-page.js
├── utils/
│   ├── logger.js
│   └── reporting.js
└── tests/
    └── course-search-load-test.js

```

## Running

```powershell
$env:K6_BROWSER_ENABLED="true"
k6 run tests/course-search-load-test.js
```

To see browsers visually (headed mode):

```powershell
$env:K6_BROWSER_HEADLESS="false"
k6 run tests/course-search-load-test.js
```

After the run, open `index.html` for a shareable HTML report.

## CI/CD

A GitHub Actions workflow runs the load test on demand and publishes the HTML report to GitHub Pages.

### Running the workflow manually

1. Go to the **Actions** tab in the GitHub repository
2. Select **TAFE NSW Course Search Load Test** from the left panel under _All workflows_
3. Click the **Run workflow** dropdown
4. Select **Branch: main**
5. Click **Run workflow**

After the run completes, the report is deployed to GitHub Pages automatically at [https://abhidp.github.io/tafe-k6/](https://abhidp.github.io/tafe-k6/)

## What It Does

1. Opens 5 Chromium browsers in parallel
2. Each VU searches for a different course from `data/courses.json`
3. Asserts that the filtered results heading is visible
4. Captures search duration, FCP, and LCP

## Metrics

| Metric                     | Description                                     |
| -------------------------- | ----------------------------------------------- |
| `search_duration`          | Search submit to results loaded (p90, p95, avg) |
| `assertions_passed/failed` | Pass/fail count for UI assertion                |
| `web_vital_fcp`            | First Contentful Paint                          |
| `web_vital_lcp`            | Largest Contentful Paint                        |

## Thresholds

- `search_duration` p90 < 15s, p95 < 20s
- At least 1 assertion must pass
