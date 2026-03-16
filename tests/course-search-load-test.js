import { browser } from 'k6/browser'
import { check } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { HomePage } from '../pages/home-page.js'
import { SearchResultsPage } from '../pages/search-results-page.js'
import { logVU } from '../utils/logger.js'
import { generateReport } from '../utils/reporting.js'

const config = JSON.parse(open('../config.json'))
const courses = new SharedArray('courses', () => JSON.parse(open('../data/courses.json')))

const lcpMetric = new Trend('web_vital_lcp', true)
const fcpMetric = new Trend('web_vital_fcp', true)
const searchDuration = new Trend('search_duration', true)
const assertionsPassed = new Counter('assertions_passed')
const assertionsFailed = new Counter('assertions_failed')

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
    search_duration: [`p(90)<${config.thresholds.searchDurationP90}`, `p(95)<${config.thresholds.searchDurationP95}`],
    assertions_passed: ['count>0']
  }
}

export function handleSummary(data) { return generateReport(data) }

export default async function () {
  const course = courses[__VU - 1]
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    const homePage = new HomePage(page, config)
    const resultsPage = new SearchResultsPage(page, config)
    await homePage.navigate()

    const start = Date.now()
    await homePage.searchForCourse(course)
    const elapsed = Date.now() - start
    searchDuration.add(elapsed)

    let headingVisible = false
    let resultsText
    try {
      await resultsPage.waitForResults()
      headingVisible = true
      resultsText = await resultsPage.getResultsHeadingText()
    } catch {
      // waitForResults timed out — fall back to checking if the heading showed up at all
      headingVisible = await resultsPage.isResultsHeadingVisible()
      resultsText = headingVisible ? (await resultsPage.getResultsHeadingText()) + ' (unfiltered)' : 'NOT VISIBLE'
    }

    const passed = check(page, { 'search results heading is visible': () => headingVisible })
    passed ? assertionsPassed.add(1) : assertionsFailed.add(1)

    // grab web vitals while the page is still open
    const vitals = await resultsPage.getWebVitals()
    if (vitals.fcp) fcpMetric.add(vitals.fcp)
    if (vitals.lcp) lcpMetric.add(vitals.lcp)

    logVU({
      vu: __VU, course, searchMs: elapsed,
      results: resultsText, passed,
      fcp: vitals.fcp, lcp: vitals.lcp
    })
  } finally {
    await page.close()
    await context.close()
  }
}
