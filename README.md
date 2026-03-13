# TAFE NSW K6 Browser Load Test

Load test that searches for courses on [tafensw.edu.au](https://www.tafensw.edu.au) using 5 concurrent browser VUs.

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v0.46+ (includes the browser module)
- Chromium is bundled with k6 browser — no separate install needed

## Project Structure

```
├── load-test.js    # Main k6 browser test script
├── courses.json    # Test data (5 course names)
└── README.md       # This file
```

## Running the Test

```bash
K6_BROWSER_ENABLED=true k6 run load-test.js
```

On Windows (PowerShell):

```powershell
$env:K6_BROWSER_ENABLED="true"; k6 run load-test.js
```

## What It Does

1. Opens 5 browser instances concurrently
2. Each VU navigates to tafensw.edu.au and searches for a different course from `courses.json`
3. Asserts that a search results heading is visible after search
4. Captures response time and Web Vitals (FCP, LCP)

## Metrics Reported

| Metric | Description |
|---|---|
| `search_duration` | Time from search submit to results page load (p90, p95, avg) |
| `assertions_passed` | Count of successful UI assertions |
| `assertions_failed` | Count of failed UI assertions |
| `web_vital_fcp` | First Contentful Paint |
| `web_vital_lcp` | Largest Contentful Paint (approximated via loadEventEnd) |

## Thresholds

- `search_duration` p90 < 15s, p95 < 20s
- At least 1 assertion must pass
