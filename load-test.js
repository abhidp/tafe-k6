import { browser } from 'k6/browser'
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { HomePage } from './pages/home-page.js'
import { SearchResultsPage } from './pages/search-results-page.js'
import { VULogger } from './utils/logger.js'

const config = JSON.parse(open('./config.json'))

const courses = new SharedArray('courses', function () {
  return JSON.parse(open('data/courses.json'))
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
      vus: config.scenarios.vus,
      iterations: config.scenarios.iterations,
      options: {
        browser: {
          type: 'chromium'
        }
      }
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

export default async function () {
  const course = courses[__VU - 1]
  const context = await browser.newContext()
  const page = await context.newPage()
  const logger = new VULogger(__VU, course)

  try {
    // Navigate and search
    const homePage = new HomePage(page, config)
    await homePage.navigate()

    const startTime = Date.now()
    await homePage.searchForCourse(course)
    const elapsed = Date.now() - startTime

    searchDuration.add(elapsed)
    logger.setSearchTime(elapsed)

    // Wait for filtered results and assert
    const resultsPage = new SearchResultsPage(page, config)
    let headingVisible = false

    try {
      await resultsPage.waitForFilteredResults()
      headingVisible = true
      logger.setResults(await resultsPage.getResultsHeadingText())
    } catch {
      headingVisible = await resultsPage.isResultsHeadingVisible()
      if (headingVisible) {
        logger.setResults(
          (await resultsPage.getResultsHeadingText()) + ' (unfiltered)'
        )
      } else {
        logger.setResults('NOT VISIBLE')
      }
    }

    const passed = check(page, {
      'search results heading is visible': () => headingVisible
    })
    logger.setAssertion(passed)

    if (passed) {
      assertionsPassed.add(1)
    } else {
      assertionsFailed.add(1)
    }

    // Capture Web Vitals
    const webVitals = await resultsPage.getWebVitals()

    if (webVitals.fcp) {
      fcpMetric.add(webVitals.fcp)
      logger.setFCP(webVitals.fcp)
    }
    if (webVitals.lcp) {
      lcpMetric.add(webVitals.lcp)
      logger.setLCP(webVitals.lcp)
    }

    logger.flush()
  } finally {
    await page.close()
    await context.close()
  }
}
