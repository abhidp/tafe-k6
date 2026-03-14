const SELECTORS = {
  resultsHeading: 'h4.h4.text-grey-01'
}

export class SearchResultsPage {
  constructor(page, config) {
    this.page = page
    this.config = config
  }

  async waitForResults() {
    // After navigation, the page renders in stages:
    //   0 (loading) → actual filtered count
    // Poll until the heading shows a count greater than 0,
    // meaning the search API has responded and the UI has updated.
    await this.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        const match = el.textContent.trim().match(/^(\d+)/)
        if (!match) return false
        return parseInt(match[1]) > 0
      },
      { timeout: this.config.timeouts.filteredResults },
      SELECTORS.resultsHeading
    )
  }

  async getResultsHeadingText() {
    const heading = this.page.locator(SELECTORS.resultsHeading)
    return await heading.first().textContent()
  }

  async isResultsHeadingVisible() {
    try {
      const heading = this.page.locator(SELECTORS.resultsHeading)
      await heading
        .first()
        .waitFor({
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
      const entries = performance.getEntriesByType('paint')
      const fcp = entries.find((e) => e.name === 'first-contentful-paint')
      const navEntries = performance.getEntriesByType('navigation')
      const lcp = navEntries.length > 0 ? navEntries[0].loadEventEnd : null
      return {
        fcp: fcp ? fcp.startTime : null,
        lcp: lcp
      }
    })
  }
}
