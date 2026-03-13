# K6 Browser Load Test - Code Explained (Step by Step)

This document walks through every part of `load-test.js` so you can understand what it does, why each piece exists, and be ready to explain or defend the approach.

---

## The Big Picture (What Does This Test Do?)

Imagine 5 people all opening the TAFE NSW website at the same time, each searching for a different course, and then checking whether the results actually showed up. That's exactly what this script does — except the "people" are virtual browser users controlled by k6.

---

## Part 1: Imports (Lines 1-4)

```js
import { browser } from 'k6/browser'
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'
```

These are like grabbing tools from a toolbox before you start work. Each import gives us a specific capability:

| Import        | What It Does                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser`     | Lets k6 open a real Chromium browser and interact with web pages (click, type, navigate). This is the k6 browser module — NOT Puppeteer or Playwright. It's built into k6 v0.46+.     |
| `check`       | k6's way of doing assertions (pass/fail checks). Similar to `assert` in other testing frameworks, but instead of crashing the test on failure, it records the result and keeps going. |
| `Trend`       | A custom metric type that collects a series of values and automatically calculates avg, min, max, p90, p95 etc. Think of it like a stopwatch that remembers all lap times.            |
| `Counter`     | A custom metric type that simply counts things. Like a tally counter — click, click, click.                                                                                           |
| `SharedArray` | A memory-efficient way to share read-only data across all virtual users (VUs). Without this, each VU would load its own copy of the data into memory.                                 |

**Likely cross-question:** _"Why SharedArray instead of just JSON.parse?"_
Answer: If you have 100 VUs and use plain `JSON.parse`, k6 creates 100 separate copies of the data in memory. `SharedArray` loads it once and shares it across all VUs. With 5 VUs the difference is negligible, but it's a best practice that matters at scale.

---

## Part 2: Loading Test Data (Lines 6-8)

```js
const courses = new SharedArray('courses', function () {
  return JSON.parse(open('./courses.json'))
})
```

This loads the `courses.json` file which contains:

```json
["Accounting", "Cybersecurity", "Counselling", "Carpentry", "Nursing"]
```

**What happens here step by step:**

1. `open('./courses.json')` — k6's built-in function that reads a file from disk. This runs at **init time** (before the test starts), not during the test.
2. `JSON.parse(...)` — converts the raw text into a JavaScript array.
3. `new SharedArray('courses', ...)` — wraps it in a shared, read-only array that all 5 VUs can access without duplicating memory.

**Important:** `open()` is a k6-specific function. It is NOT the same as Node.js `fs.readFile`. It only works during the init stage (outside the default function).

---

## Part 3: Custom Metrics (Lines 11-15)

```js
const searchDuration = new Trend('search_duration', true)
const assertionsPassed = new Counter('assertions_passed')
const assertionsFailed = new Counter('assertions_failed')
const lcpMetric = new Trend('web_vital_lcp', true)
const fcpMetric = new Trend('web_vital_fcp', true)
```

Here we define 5 custom metrics that k6 will track and report at the end:

| Variable           | Type    | What It Tracks                                                               | The `true` parameter                                                     |
| ------------------ | ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `searchDuration`   | Trend   | How long each search took (in ms). A Trend gives us avg, min, max, p90, p95. | `true` means "display values as durations (ms/s)" instead of raw numbers |
| `assertionsPassed` | Counter | How many VUs saw the results heading successfully                            | N/A for Counter                                                          |
| `assertionsFailed` | Counter | How many VUs did NOT see the results heading                                 | N/A for Counter                                                          |
| `lcpMetric`        | Trend   | Largest Contentful Paint — how long until the biggest visible element loaded | `true` = show as duration                                                |
| `fcpMetric`        | Trend   | First Contentful Paint — how long until the browser showed ANY content       | `true` = show as duration                                                |

**Likely cross-question:** _"Why define custom metrics when k6 already tracks things?"_
Answer: k6 automatically tracks generic metrics like `iteration_duration` and `browser_http_req_duration`. But those are broad. Custom metrics let us measure exactly what we care about — specifically how long the _search_ took, not the entire page load or iteration.

---

## Part 4: Test Configuration / Options (Lines 17-34)

```js
export const options = {
  scenarios: {
    course_search: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium'
        }
      }
    }
  },
  thresholds: {
    search_duration: ['p(90)<15000', 'p(95)<20000'],
    assertions_passed: ['count>0']
  }
}
```

This is the **test plan**. It tells k6 _how_ to run the test.

### Scenarios

A scenario defines the load pattern. Ours is called `course_search`:

| Setting        | Value                 | Meaning                                                                                                                             |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `executor`     | `'per-vu-iterations'` | Each VU runs a fixed number of iterations. Other executors exist (e.g., `constant-vus`, `ramping-vus`) for different load patterns. |
| `vus`          | `5`                   | Spin up 5 virtual users (5 browser instances running in parallel).                                                                  |
| `iterations`   | `1`                   | Each VU runs the test function exactly once. So 5 VUs x 1 iteration = 5 total test runs.                                            |
| `browser.type` | `'chromium'`          | Use Chromium as the browser engine (currently the only option k6 supports).                                                         |

**Likely cross-question:** _"Why `per-vu-iterations` instead of `constant-vus`?"_
Answer: `per-vu-iterations` guarantees each VU runs exactly once and then stops. This is ideal when each VU uses different test data (like our 5 courses). `constant-vus` would keep VUs running for a set duration and loop, which we don't need here.

### Thresholds

Thresholds are pass/fail criteria for the entire test. If any threshold fails, k6 exits with a non-zero exit code (useful in CI/CD pipelines).

| Threshold                     | Meaning                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `search_duration p(90)<15000` | 90% of searches must complete in under 15 seconds       |
| `search_duration p(95)<20000` | 95% of searches must complete in under 20 seconds       |
| `assertions_passed count>0`   | At least 1 VU must successfully see the results heading |

---

## Part 5: The Test Function (Lines 36-117)

```js
export default async function () {
```

This is the **main test logic** that each VU executes. k6 calls this function once per VU (because we set `iterations: 1`). It's `async` because browser operations (clicking, typing, navigating) are asynchronous — they take time, and we need to wait for them.

### Step 5a: Pick a Course (Line 37)

```js
const course = courses[__VU - 1]
```

`__VU` is a k6 built-in variable that gives the current Virtual User's ID number (1, 2, 3, 4, or 5). Since arrays are zero-indexed, we subtract 1:

| VU Number (`__VU`) | Array Index (`__VU - 1`) | Course        |
| ------------------ | ------------------------ | ------------- |
| 1                  | 0                        | Accounting    |
| 2                  | 1                        | Cybersecurity |
| 3                  | 2                        | Counselling   |
| 4                  | 3                        | Carpentry     |
| 5                  | 4                        | Nursing       |

This ensures each VU searches for a **different** course.

### Step 5b: Open a Browser (Lines 38-39)

```js
const context = await browser.newContext()
const page = await context.newPage()
```

This is a two-step process, similar to how Playwright works:

1. **`browser.newContext()`** — creates an isolated browser session (like opening an incognito window). Each context has its own cookies, cache, and storage. This means VU 1's session doesn't interfere with VU 2's.

2. **`context.newPage()`** — opens a new tab/page inside that session. This is what we'll interact with.

**Likely cross-question:** _"Why context AND page? Why not just open a page directly?"_
Answer: The context provides isolation. If we needed multiple tabs in one session (sharing cookies), we'd create multiple pages in one context. Here we use one page per context because each VU is an independent user.

### Step 5c: Navigate to the Website (Lines 43-46)

```js
await page.goto('https://www.tafensw.edu.au/course-search', {
  waitUntil: 'networkidle',
  timeout: 60000
})
```

| Parameter   | Value            | Meaning                                                                                                                                                                            |
| ----------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL         | `/course-search` | Go directly to the course search page (not the homepage)                                                                                                                           |
| `waitUntil` | `'networkidle'`  | Don't consider the page "loaded" until there have been no new network requests for at least 500ms. This ensures dynamic content (loaded via JavaScript/APIs) has finished loading. |
| `timeout`   | `60000`          | Give up after 60 seconds if the page hasn't reached network idle                                                                                                                   |

Other `waitUntil` options include `'load'` (waits for the `load` event) and `'domcontentloaded'` (waits for HTML to be parsed). `'networkidle'` is the strictest — it waits for everything.

### Step 5d: Find and Fill the Search Input (Lines 55-57)

```js
const searchInput = page.locator(
  'input[placeholder="Search for courses or other content"], input[type="text"]'
)
await searchInput.first().fill(course)
```

**What is a locator?**
A locator is k6's way of finding an element on the page — like a CSS selector that points to a specific HTML element. It's similar to `document.querySelector()` in vanilla JavaScript.

This locator uses a CSS selector with two options separated by a comma:

1. `input[placeholder="Search for courses or other content"]` — find an input whose placeholder text matches exactly
2. `input[type="text"]` — fallback: find any text input

The comma means "try the first, if not found, try the second" (CSS OR selector).

`.first()` — if multiple elements match, take the first one.

`.fill(course)` — clear the input and type the course name into it. So VU 1 types "Accounting", VU 2 types "Cybersecurity", etc.

### Step 5e: Submit the Search and Measure Time (Lines 60-66)

```js
const startTime = Date.now()
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
  searchInput.first().press('Enter')
])
const elapsed = Date.now() - startTime
searchDuration.add(elapsed)
```

This is the most important performance measurement block. Let's break it down:

1. **`Date.now()`** — record the current timestamp in milliseconds (start the stopwatch).

2. **`Promise.all([...])`** — run two things at the same time:
   - **`page.waitForNavigation(...)`** — start listening for the page to navigate (load a new URL). This is set up BEFORE pressing Enter so we don't miss the navigation event.
   - **`searchInput.first().press('Enter')`** — simulate pressing the Enter key, which triggers the search.

   `Promise.all` waits until BOTH promises resolve — meaning Enter has been pressed AND the resulting page has fully loaded (network idle).

3. **`Date.now() - startTime`** — stop the stopwatch. The difference is how many milliseconds the search took.

4. **`searchDuration.add(elapsed)`** — record this value in our custom Trend metric.

**Likely cross-question:** _"Why Promise.all instead of just pressing Enter and then waiting?"_
Answer: If you press Enter first and THEN set up `waitForNavigation`, there's a race condition — the navigation might complete before you start listening for it, so `waitForNavigation` would hang forever waiting for a navigation that already happened. By starting both simultaneously with `Promise.all`, you guarantee the listener is ready before the navigation begins.

### Step 5f: Assert the Results Heading is Visible (Lines 70-91)

```js
const resultsHeading = page.locator('h4.h4.text-grey-01')

let headingVisible = false
try {
  await resultsHeading.first().waitFor({ state: 'visible', timeout: 10000 })
  headingVisible = true
  const text = await resultsHeading.first().textContent()
  console.log(`VU ${__VU}: Results heading: "${text}"`)
} catch {
  headingVisible = false
}
```

**What we're checking:** After the search, the page shows a heading like "662 course results". This is an `<h4>` element with CSS classes `h4` and `text-grey-01`. We want to verify this element is visible on the page.

**How we found this selector:** We ran a debug version of the script that logged all visible headings on the page. We discovered the results count lives in `<h4 class="h4 text-grey-01">`. The `h1` with "Search results" text has `class="sr-only"` (screen-reader only = visually hidden), so checking its visibility would always fail.

**The flow:**

1. Create a locator pointing to `h4.h4.text-grey-01`
2. Wait up to 10 seconds for it to become visible
3. If it appears → set `headingVisible = true` and log the text
4. If it doesn't appear within 10 seconds → the `waitFor` throws an error, which we catch, and `headingVisible` stays `false`

Then we record the result using k6's `check`:

```js
const passed = check(page, {
  'search results heading is visible': () => headingVisible
})

if (passed) {
  assertionsPassed.add(1)
} else {
  assertionsFailed.add(1)
}
```

**`check()`** is k6's assertion function. It takes:

- An object to check against (the page — used for context/reporting)
- An object of named checks, where each value is a function returning `true` or `false`

It returns `true` if ALL checks passed, `false` if any failed. Unlike `assert` in unit tests, **a failed check does NOT stop the test**. It just records the failure.

We then increment either `assertionsPassed` or `assertionsFailed` counter accordingly.

### Step 5g: Capture Web Vitals (Lines 94-112)

```js
const webVitals = await page.evaluate(() => {
  const entries = performance.getEntriesByType('paint')
  const fcp = entries.find((e) => e.name === 'first-contentful-paint')
  const navEntries = performance.getEntriesByType('navigation')
  const lcp = navEntries.length > 0 ? navEntries[0].loadEventEnd : null
  return {
    fcp: fcp ? fcp.startTime : null,
    lcp: lcp
  }
})
```

**`page.evaluate()`** runs a JavaScript function inside the browser (not in k6). Think of it as: "Hey browser, run this code in your console and give me the result."

Inside the browser, we access the **Performance API** — a built-in browser API that records timing data:

| What We Fetch                      | How                                                                          | What It Means                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FCP** (First Contentful Paint)   | `performance.getEntriesByType('paint')` then find `'first-contentful-paint'` | The time when the browser first rendered ANY text, image, or canvas on screen. A user goes from staring at a blank white page to seeing _something_. |
| **LCP** (Largest Contentful Paint) | `navEntries[0].loadEventEnd`                                                 | Approximated here using `loadEventEnd` from navigation timing. Represents when the page's main content has finished rendering.                       |

Then we record these values into our custom Trend metrics:

```js
if (webVitals.fcp) {
  fcpMetric.add(webVitals.fcp)
}
if (webVitals.lcp) {
  lcpMetric.add(webVitals.lcp)
}
```

**Note:** k6 browser module also automatically captures Web Vitals as built-in metrics (`browser_web_vital_fcp`, `browser_web_vital_lcp`, etc.) — you'll see these in the output even without this manual code. Our custom metrics here are an additional capture using the Performance API directly.

### Step 5h: Cleanup (Lines 113-116)

```js
} finally {
  await page.close()
  await context.close()
}
```

The `finally` block runs no matter what — whether the test passed, failed, or threw an error. It:

1. Closes the page (tab)
2. Closes the browser context (incognito session)

This prevents browser processes from leaking and consuming memory. Without this, you'd end up with orphaned Chromium processes.

**Likely cross-question:** _"Why `finally` instead of just putting close() at the end?"_
Answer: If an error occurs anywhere in the `try` block (e.g., the page times out), code after the `try` block wouldn't execute. `finally` guarantees cleanup happens even if the test crashes midway.

---

## Execution Flow Summary

Here's what happens when you run `k6 run load-test.js`:

```
INIT STAGE (runs once)
  ├── Load courses.json into SharedArray
  ├── Define custom metrics
  └── Read options (5 VUs, 1 iteration each, thresholds)

TEST STAGE (runs in parallel)
  ├── VU 1: Search "Accounting"   → measure time → check heading → capture vitals → cleanup
  ├── VU 2: Search "Cybersecurity"→ measure time → check heading → capture vitals → cleanup
  ├── VU 3: Search "Counselling"  → measure time → check heading → capture vitals → cleanup
  ├── VU 4: Search "Carpentry"    → measure time → check heading → capture vitals → cleanup
  └── VU 5: Search "Nursing"      → measure time → check heading → capture vitals → cleanup

TEARDOWN STAGE
  └── k6 aggregates all metrics, evaluates thresholds, prints report
```

All 5 VUs run **simultaneously** (in parallel), not one after another. This simulates real concurrent load on the website.

---

## Key Concepts to Remember

| Concept               | One-Line Explanation                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| **VU (Virtual User)** | A simulated user running your test script independently                               |
| **Executor**          | Defines the load pattern (how many VUs, how long, how many iterations)                |
| **Locator**           | A CSS/text selector that finds an element on the page                                 |
| **Trend metric**      | Collects values over time and calculates percentiles (p90, p95, avg, etc.)            |
| **Counter metric**    | Simply counts occurrences (pass count, fail count)                                    |
| **Threshold**         | A pass/fail rule applied to a metric — determines if the test overall passes or fails |
| **check()**           | An assertion that records pass/fail but does NOT stop the test                        |
| **networkidle**       | Wait strategy: page is "loaded" when no network requests happen for 500ms             |
| **Promise.all**       | Run multiple async operations simultaneously, wait for all to finish                  |
| **page.evaluate()**   | Execute JavaScript inside the browser and return the result to k6                     |
| **finally**           | Cleanup block that runs whether the test passes or crashes                            |
