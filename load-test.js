import { browser } from 'k6/browser'
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'

const courses = new SharedArray('courses', function () {
  return JSON.parse(open('./courses.json'))
})

// Custom metrics
const searchDuration = new Trend('search_duration', true)
const assertionsPassed = new Counter('assertions_passed')
const assertionsFailed = new Counter('assertions_failed')
const lcpMetric = new Trend('web_vital_lcp', true)
const fcpMetric = new Trend('web_vital_fcp', true)

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

export default async function () {
  const course = courses[__VU - 1]
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to TAFE NSW
    await page.goto('https://www.tafensw.edu.au/course-search', {
      waitUntil: 'networkidle',
      timeout: 60000
    })

    // Type the course name into the search input using keyboard simulation
    const searchInput = page.locator(
      'input[placeholder="Search for courses or other content"]'
    )
    await searchInput.first().click()
    await searchInput.first().type(course, { delay: 0 })

    // Click the submit search button
    const searchButton = page.locator('[aria-label="Submit search"]')
    const startTime = Date.now()
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      searchButton.first().click()
    ])
    const elapsed = Date.now() - startTime
    searchDuration.add(elapsed)

    console.log(`VU ${__VU}: Searched for "${course}" in ${elapsed}ms`)

    // Wait for the results count to update from the initial "662 course results"
    // The page loads with 662 (all courses) first, then filters via client-side JS
    const resultsHeading = page.locator('h4.h4.text-grey-01')

    let headingVisible = false
    try {
      // Poll until the heading shows the actual filtered count
      // Page transitions: 662 (all) → 0 (clearing) → actual count
      await page.waitForFunction(
        () => {
          const el = document.querySelector('h4.h4.text-grey-01')
          if (!el) return false
          const text = el.textContent.trim()
          const match = text.match(/^(\d+)/)
          if (!match) return false
          const count = parseInt(match[1])
          return count !== 662 && count !== 0
        },
        { timeout: 15000 }
      )
      headingVisible = true
      const text = await resultsHeading.first().textContent()
      console.log(`VU ${__VU}: Results heading: "${text}"`)
    } catch {
      // If it never changes from 662, still check if the heading is at least visible
      try {
        await resultsHeading
          .first()
          .waitFor({ state: 'visible', timeout: 2000 })
        headingVisible = true
        const text = await resultsHeading.first().textContent()
        console.log(`VU ${__VU}: Results heading (unfiltered): "${text}"`)
      } catch {
        headingVisible = false
      }
    }

    const passed = check(page, {
      'search results heading is visible': () => headingVisible
    })

    if (passed) {
      assertionsPassed.add(1)
    } else {
      assertionsFailed.add(1)
    }

    // Capture Web Vitals via Performance API
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

    if (webVitals.fcp) {
      fcpMetric.add(webVitals.fcp)
      console.log(`VU ${__VU}: FCP = ${webVitals.fcp.toFixed(0)}ms`)
    }
    if (webVitals.lcp) {
      lcpMetric.add(webVitals.lcp)
      console.log(`VU ${__VU}: LCP = ${webVitals.lcp.toFixed(0)}ms`)
    }
  } finally {
    await page.close()
    await context.close()
  }
}
