const SELECTORS = {
  resultsHeading: 'h4.h4.text-grey-01'
}

export class SearchResultsPage {
  constructor(page, config) {
    this.page = page
    this.config = config
  }

  async waitForResults() {
    // poll until the heading shows a non-zero result count (e.g. "42 results for Accounting")
    await this.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        const match = el.textContent.trim().match(/^(\d+)/)
        return match && parseInt(match[1]) > 0
      },
      { timeout: this.config.timeouts.filteredResults },
      SELECTORS.resultsHeading
    )
  }

  async getResultsHeadingText() {
    return await this.page.locator(SELECTORS.resultsHeading).first().textContent()
  }

  async isResultsHeadingVisible() {
    try {
      await this.page.locator(SELECTORS.resultsHeading).first().waitFor({
        state: 'visible',
        timeout: this.config.timeouts.elementVisibility
      })
      return true
    } catch {
      return false
    }
  }

  async getWebVitals() {
    return await this.page.evaluate(() => {
      const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')
      const nav = performance.getEntriesByType('navigation')
      return {
        fcp: fcp ? fcp.startTime : null,
        lcp: nav.length > 0 ? nav[0].loadEventEnd : null
      }
    })
  }
}
