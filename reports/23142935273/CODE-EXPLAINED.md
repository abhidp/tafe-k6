# K6 Browser Load Test - Code Explained

This document walks through every part of the TAFE NSW course search load test so you can understand what it does, why each piece exists, and be ready to explain or defend the approach.

---

## Project Structure

```
tafe-k6/
├── config.json                          # URLs, timeouts, VU count, thresholds
├── data/
│   └── courses.json                     # Test data (5 course names)
├── pages/
│   ├── home-page.js                     # Page Object: homepage locators + actions
│   └── search-results-page.js           # Page Object: results page locators + actions
├── utils/
│   ├── logger.js                        # Collects VU metrics, logs one summary line
│   └── reporting.js                     # HTML report generation + browser metric patches
└── tests/
    └── course-search-load-test.js       # Main test script (orchestration only)
```

**Why this structure?**
This follows the **Page Object Model (POM)** pattern from UI automation. Locators and page interactions live in `pages/`, utility logic lives in `utils/`, and the test script only orchestrates. If a selector changes on the site, you update one file in `pages/` — not the test.

---

## The Big Picture

Imagine 5 people all opening the TAFE NSW website at the same time, each searching for a different course, and then checking whether the results actually showed up. That's exactly what this test does — except the "people" are virtual browser users controlled by k6.

---

## config.json

```json
{
  "baseUrl": "https://www.tafensw.edu.au",
  "timeouts": {
    "navigation": 60000,
    "search": 30000,
    "filteredResults": 15000,
    "elementVisibility": 5000
  },
  "scenarios": { "vus": 5, "iterations": 1 },
  "thresholds": { "searchDurationP90": 15000, "searchDurationP95": 20000 }
}
```

All tunables in one place. To change the URL, timeout, VU count, or thresholds — edit this JSON file without touching any script code. The test loads it at init time via `open()`.

---

## data/courses.json

```json
["Accounting", "Cybersecurity", "Counselling", "Carpentry", "Nursing"]
```

Five course names, one per VU. Loaded into a `SharedArray` so all VUs share one copy in memory.

---

## Test Script: course-search-load-test.js

### Imports

```js
import { browser } from 'k6/browser'
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { HomePage } from '../pages/home-page.js'
import { SearchResultsPage } from '../pages/search-results-page.js'
import { VULogger } from '../utils/logger.js'
import { generateReport } from '../utils/reporting.js'
```

| Import                          | What It Does                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `browser`                       | k6 browser module — opens real Chromium instances. NOT Puppeteer or Playwright. Built into k6 v0.46+.                     |
| `check`                         | k6's assertion function. Records pass/fail but does NOT stop the test on failure.                                         |
| `Trend`                         | Custom metric that collects values and calculates avg, min, max, p90, p95. Like a stopwatch that remembers all lap times. |
| `Counter`                       | Custom metric that simply counts things. Like a tally counter.                                                            |
| `SharedArray`                   | Memory-efficient way to share read-only data across all VUs. Without this, each VU loads its own copy.                    |
| `HomePage`, `SearchResultsPage` | Page Object classes — locators and actions for each page.                                                                 |
| `VULogger`                      | Collects all metrics for a VU, then logs one summary line.                                                                |
| `generateReport`                | Generates an HTML report and patches browser metrics for correct display.                                                 |

### Loading Config and Test Data

```js
const config = JSON.parse(open('../config.json'))
const courses = new SharedArray('courses', () =>
  JSON.parse(open('../data/courses.json'))
)
```

`open()` is a k6-specific function that reads a file from disk at **init time** (before the test starts). It is NOT the same as Node.js `fs.readFile`. It only works outside the default function.

`SharedArray` wraps the data in a shared, read-only array. With 5 VUs the memory difference is negligible, but with 100+ VUs it prevents creating 100 separate copies.

### Custom Metrics

```js
const searchDuration = new Trend('search_duration', true)
const assertionsPassed = new Counter('assertions_passed')
const assertionsFailed = new Counter('assertions_failed')
const fcpMetric = new Trend('web_vital_fcp', true)
const lcpMetric = new Trend('web_vital_lcp', true)
```

| Metric             | Type    | Tracks                                                         | `true` parameter                   |
| ------------------ | ------- | -------------------------------------------------------------- | ---------------------------------- |
| `searchDuration`   | Trend   | How long each search took. Gives avg, min, max, p90, p95.      | Display values as durations (ms/s) |
| `assertionsPassed` | Counter | How many VUs saw the results heading                           | N/A                                |
| `assertionsFailed` | Counter | How many VUs did NOT see the results heading                   | N/A                                |
| `fcpMetric`        | Trend   | First Contentful Paint — time until browser showed ANY content | Display as duration                |
| `lcpMetric`        | Trend   | Largest Contentful Paint — time until main content rendered    | Display as duration                |

**Why custom metrics when k6 tracks things automatically?**
k6 tracks generic metrics like `iteration_duration` and `browser_http_req_duration`. Custom metrics let us measure exactly what we care about — specifically how long the _search_ took, not the entire iteration.

### Options (Test Configuration)

```js
export const options = {
  scenarios: {
    course_search: {
      executor: 'per-vu-iterations',
      vus: config.scenarios.vus,
      iterations: config.scenarios.iterations,
      options: { browser: { type: 'chromium' } }
    }
  },
  thresholds: {
    search_duration: [
      `p(90)<${config.thresholds.searchDurationP90}`,
      `p(95)<${config.thresholds.searchDurationP95}`
    ],
    assertions_passed: ['count>0']
  }
}
```

| Setting        | Value               | Meaning                                                        |
| -------------- | ------------------- | -------------------------------------------------------------- |
| `executor`     | `per-vu-iterations` | Each VU runs a fixed number of iterations then stops.          |
| `vus`          | `5`                 | 5 virtual users (5 browser instances in parallel).             |
| `iterations`   | `1`                 | Each VU runs the test function once. 5 VUs x 1 = 5 total runs. |
| `browser.type` | `chromium`          | Use Chromium (currently the only option k6 supports).          |

**Thresholds** are pass/fail criteria for the entire test. If any threshold fails, k6 exits with a non-zero code (useful in CI/CD).

| Threshold                     | Meaning                                        |
| ----------------------------- | ---------------------------------------------- |
| `search_duration p(90)<15000` | 90% of searches must complete under 15 seconds |
| `search_duration p(95)<20000` | 95% of searches must complete under 20 seconds |
| `assertions_passed count>0`   | At least 1 VU must see the results heading     |

### handleSummary

```js
export function handleSummary(data) {
  return generateReport(data)
}
```

k6 calls this automatically when the test ends. It delegates to `utils/reporting.js` which generates an HTML report file and prints the console summary.

### The Default Function (What Each VU Executes)

```js
export default async function () {
```

This is the **callback** that k6 calls for each VU. You never write a loop — **k6 IS the loop**. Based on the scenario config, k6 spawns 5 VUs and calls this function once per VU, all in parallel.

It's `async` because browser operations (clicking, typing, navigating) take time and we need to `await` them.

### Picking a Course

```js
const course = courses[__VU - 1]
```

`__VU` is a k6 built-in variable — the current Virtual User's ID number (1, 2, 3, 4, 5). Since arrays are zero-indexed, we subtract 1:

| `__VU` | `__VU - 1` | Course        |
| ------ | ---------- | ------------- |
| 1      | 0          | Accounting    |
| 2      | 1          | Cybersecurity |
| 3      | 2          | Counselling   |
| 4      | 3          | Carpentry     |
| 5      | 4          | Nursing       |

Each VU searches for a **different** course. If `iterations` were set to 3, VU 1 would search "Accounting" all 3 times because `__VU` never changes for a given VU.

k6 also provides `__ITER` (iteration number, starting from 0). To vary the course per iteration: `courses[__ITER % courses.length]`.

### Opening a Browser

```js
const context = await browser.newContext()
const page = await context.newPage()
```

Two-step process:

1. **`browser.newContext()`** — creates an isolated browser session (like an incognito window). Each context has its own cookies, cache, and storage. VU 1's session doesn't interfere with VU 2's.
2. **`context.newPage()`** — opens a new tab inside that session.

Think of it like checking into a hotel — the context is your room (isolated), and the page is the desk where you do your work.

### Creating Page Objects and Navigating

```js
const homePage = new HomePage(page, config)
const resultsPage = new SearchResultsPage(page, config)
await homePage.navigate()
```

The `new` keyword creates an instance and calls the **constructor**. The constructor stores `page` and `config` so every method in the class can use them:

```js
constructor(page, config) {
  this.page = page      // store once
  this.config = config   // store once
}
```

Think of the constructor as filling out a form when you check into a hotel — you give your details once at reception, and every service (room service, spa, concierge) already has your information. You don't re-introduce yourself every time.

Without the constructor, you'd have to pass `page` and `config` to every method call.

### Measuring Search Duration

```js
const start = Date.now()
await homePage.searchForCourse(course)
const elapsed = Date.now() - start
searchDuration.add(elapsed)
```

Stopwatch pattern: record timestamp before, record after, difference = duration. Only measures the search action — typing + navigation — not page object creation or assertion time.

### Asserting Results

```js
let headingVisible = false
try {
  await resultsPage.waitForResults()
  headingVisible = true
  logger.setResults(await resultsPage.getResultsHeadingText())
} catch {
  headingVisible = await resultsPage.isResultsHeadingVisible()
  logger.setResults(
    headingVisible
      ? (await resultsPage.getResultsHeadingText()) + ' (unfiltered)'
      : 'NOT VISIBLE'
  )
}
```

`waitForResults()` polls the page until the results heading shows a count > 0 (the page transitions from 0 → actual filtered count). If it succeeds, we read the heading text ("24 course results"). If it times out, we fall back to checking basic visibility.

```js
const passed = check(page, {
  'search results heading is visible': () => headingVisible
})
passed ? assertionsPassed.add(1) : assertionsFailed.add(1)
```

`check()` records pass/fail but does NOT stop the test. Unlike `assert` in unit tests, a failed check logs the failure and the test continues.

### Capturing Web Vitals

```js
const vitals = await resultsPage.getWebVitals()
if (vitals.fcp) {
  fcpMetric.add(vitals.fcp)
  logger.setFCP(vitals.fcp)
}
if (vitals.lcp) {
  lcpMetric.add(vitals.lcp)
  logger.setLCP(vitals.lcp)
}
```

`getWebVitals()` uses `page.evaluate()` to run JavaScript **inside the browser** (not in k6) and access the Performance API:

| Metric                             | What It Means                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| **FCP** (First Contentful Paint)   | When the browser first rendered ANY text or image. User goes from blank page to seeing _something_. |
| **LCP** (Largest Contentful Paint) | When the page's main content finished rendering. Approximated via `loadEventEnd`.                   |

k6 also captures these automatically as `browser_web_vital_fcp` and `browser_web_vital_lcp` — our custom metrics are an additional capture via the Performance API.

### Cleanup

```js
} finally {
  await page.close()
  await context.close()
}
```

`finally` runs no matter what — pass, fail, or crash. Closes the page and browser context to prevent orphaned Chromium processes from leaking memory.

---

## Page Object: home-page.js

```js
const SELECTORS = {
  searchInput: 'input[id="homePageSearch"]',
  searchButton: '[aria-label="Submit search"]'
}
```

All locators in one place at the top. If the site's HTML changes, update here — not in the test.

### navigate()

Opens the TAFE NSW homepage and waits until all network requests settle (`networkidle`).

### searchForCourse(courseName)

1. **`click()`** — focuses the search input
2. **`type(courseName, { delay: 50 })`** — simulates real keystrokes (50ms apart). We use `type()` instead of `fill()` because `fill()` sets the value programmatically without firing JavaScript events — the page's framework wouldn't detect the input.
3. **`Promise.all([waitForNavigation, click])`** — starts listening for navigation BEFORE clicking the search button. This avoids a race condition where the navigation might complete before you start listening.

---

## Page Object: search-results-page.js

### waitForResults()

Uses `page.waitForFunction()` to poll the DOM until the results heading shows a count > 0. The page renders in stages after search: `0 (loading) → actual filtered count`. This function waits for the transition to complete.

### getResultsHeadingText()

Returns the text content of the `h4.h4.text-grey-01` heading (e.g., "24 course results").

### isResultsHeadingVisible()

Fallback check — returns `true`/`false` for whether the heading element is visible at all, without checking its text content.

### getWebVitals()

Runs JavaScript inside the browser to extract FCP and LCP from the Performance API.

---

## Utils: logger.js

```js
export class VULogger {
  constructor(vu, course) {
    this.d = { vu, course }
  }

  setSearchTime(ms) {
    this.d.search = `${ms}ms`
  }
  setResults(text) {
    this.d.results = text
  }
  setAssertion(passed) {
    this.d.assert = passed ? 'PASS' : 'FAIL'
  }
  setFCP(ms) {
    this.d.fcp = `${ms.toFixed(0)}ms`
  }
  setLCP(ms) {
    this.d.lcp = `${ms.toFixed(0)}ms`
  }

  flush() {
    console.log(`VU ${d.vu} | course: ...`)
  }
}
```

Since VUs run in parallel, their logs interleave. The logger collects all data via setters, then `flush()` outputs one single line per VU — keeping the output readable.

---

## Utils: reporting.js

### patchBrowserMetrics(data)

Browser tests don't generate the protocol-level metrics (`http_reqs`, `data_received`, `data_sent`) that the HTML reporter expects. This function copies the browser-level equivalents into those slots:

| Reporter expects | Browser test has          | What we do                               |
| ---------------- | ------------------------- | ---------------------------------------- |
| `http_reqs`      | `browser_http_req_failed` | Sum passes + fails = total request count |
| `data_received`  | `browser_data_received`   | Copy directly                            |
| `data_sent`      | `browser_data_sent`       | Copy directly                            |

### generateReport(data)

Patches the metrics, then returns an HTML report file and console text summary.

---

## k6's Execution Model

You never write a `for` or `while` loop. **k6 IS the loop.**

```
k6 engine (Go runtime)
  │
  ├── Spawns VU 1 → calls default function()
  ├── Spawns VU 2 → calls default function()
  ├── Spawns VU 3 → calls default function()
  ├── Spawns VU 4 → calls default function()
  └── Spawns VU 5 → calls default function()
```

Your `export default function()` is a callback — k6 decides when and how many times to call it based on the executor:

| Executor            | How k6 loops                                                  |
| ------------------- | ------------------------------------------------------------- |
| `per-vu-iterations` | Each VU runs N iterations, then stops                         |
| `shared-iterations` | Total N iterations split across VUs (first-come-first-served) |
| `constant-vus`      | VUs keep looping for a set duration                           |
| `ramping-vus`       | VUs keep looping, VU count ramps up/down over time            |

### Execution Timeline

```
INIT STAGE (runs once)
  ├── Load config.json
  ├── Load courses.json into SharedArray
  ├── Define custom metrics
  └── Read options (5 VUs, 1 iteration each, thresholds)

TEST STAGE (runs in parallel)
  ├── VU 1: Search "Accounting"   → measure → assert → vitals → log → cleanup
  ├── VU 2: Search "Cybersecurity"→ measure → assert → vitals → log → cleanup
  ├── VU 3: Search "Counselling"  → measure → assert → vitals → log → cleanup
  ├── VU 4: Search "Carpentry"    → measure → assert → vitals → log → cleanup
  └── VU 5: Search "Nursing"      → measure → assert → vitals → log → cleanup

TEARDOWN STAGE
  └── k6 calls handleSummary() → generates report.html + console output
```

---

## Running the Test

```powershell
# Headless (default, for actual load testing)
$env:K6_BROWSER_ENABLED="true"
k6 run tests/course-search-load-test.js

# Headed (visible browsers, for demos)
$env:K6_BROWSER_HEADLESS="false"
k6 run tests/course-search-load-test.js
```

After the test, open `report.html` for a shareable HTML report.

---

## Key Concepts

| Concept               | One-Line Explanation                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| **VU (Virtual User)** | A simulated user running your test script independently                    |
| **`__VU`**            | k6 built-in variable — current VU's ID number (starts at 1)                |
| **`__ITER`**          | k6 built-in variable — current iteration number (starts at 0)              |
| **Executor**          | Defines the load pattern (how many VUs, how long, how many iterations)     |
| **Constructor**       | Setup function that stores dependencies so all class methods can use them  |
| **Locator**           | A CSS selector that finds an element on the page                           |
| **Trend metric**      | Collects values and calculates percentiles (p90, p95, avg, etc.)           |
| **Counter metric**    | Simply counts occurrences (pass count, fail count)                         |
| **Threshold**         | Pass/fail rule applied to a metric — determines if the overall test passes |
| **check()**           | An assertion that records pass/fail but does NOT stop the test             |
| **networkidle**       | Wait strategy: page is "loaded" when no network requests happen for 500ms  |
| **Promise.all**       | Run multiple async operations simultaneously, wait for all to finish       |
| **page.evaluate()**   | Execute JavaScript inside the browser and return the result to k6          |
| **waitForFunction()** | Poll the DOM until a condition is true (used for dynamic content)          |
| **Page Object Model** | Pattern where locators and actions live in page classes, not in tests      |
| **finally**           | Cleanup block that runs whether the test passes or crashes                 |

┌─────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Metric │ What It Means │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_http_req_duration │ How long each individual HTTP request took inside the browser (every CSS, JS, image, API call). Hundreds of these fire per page load. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_cls │ Cumulative Layout Shift — how much the page visually "jumps around" as it loads. 0 = perfectly stable. Under 0.1 is good. If buttons │
│ │ shift while you're clicking, CLS is high. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_fcp │ First Contentful Paint — time until the browser renders anything visible (text, image, spinner). User goes from blank white screen to │
│ │ seeing something. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_fid │ First Input Delay — how long the browser takes to respond to the user's first interaction (click, tap, keypress). Under 100ms is good. │
│ │ High FID means the page looks ready but is unresponsive. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_inp │ Interaction to Next Paint — how long the browser takes to visually respond to any interaction (not just the first). The successor to │
│ │ FID. Under 200ms is good. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_lcp │ Largest Contentful Paint — time until the biggest visible element (hero image, main heading, large text block) finishes rendering. This │
│ │ is when the user feels the page is "done". │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ browser_web_vital_ttfb │ Time to First Byte — time from the browser sending the request to receiving the first byte of the response from the server. Measures │
│ │ pure server speed + network latency. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ iteration_duration │ Total time for one VU to complete everything — open browser, navigate, search, assert, capture vitals, cleanup. The full end-to-end │
│ │ time. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ search_duration │ Our custom metric — time from clicking the search button to the results page finishing navigation. Just the search action, nothing │
│ │ else. │
├─────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ web_vital_fcp / │ Same as browser_web_vital_fcp/lcp — these are our custom copies captured via the Performance API. Values may differ slightly due to │
│ web_vital_lcp │ when they're read. │
└─────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Quick mental model

Think of loading a page like ordering food at a restaurant:

┌──────────────────────────────────────────────┬───────────┐
│ Stage │ Metric │
├──────────────────────────────────────────────┼───────────┤
│ Waiter acknowledges your order │ TTFB │
├──────────────────────────────────────────────┼───────────┤
│ First appetizer arrives │ FCP │
├──────────────────────────────────────────────┼───────────┤
│ Main course arrives │ LCP │
├──────────────────────────────────────────────┼───────────┤
│ You try to call the waiter and they respond │ FID / INP │
├──────────────────────────────────────────────┼───────────┤
│ Plates keep getting rearranged on your table │ CLS │
└──────────────────────────────────────────────┴───────────┘
