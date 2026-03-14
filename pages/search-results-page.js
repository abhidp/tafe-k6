// Page Object: TAFE NSW Course Search Results Page

const SELECTORS = {
  resultsHeading: 'h4.h4.text-grey-01'
}

// Total unfiltered course count shown before filtering completes
const UNFILTERED_COUNT = 662

export class SearchResultsPage {
  constructor(page, config) {
    this.page = page
    this.config = config
  }

  async waitForFilteredResults() {
    await this.page.waitForFunction(
      (unfilteredCount) => {
        const el = document.querySelector('h4.h4.text-grey-01')
        if (!el) return false
        const text = el.textContent.trim()
        const match = text.match(/^(\d+)/)
        if (!match) return false
        const count = parseInt(match[1])
        return count !== unfilteredCount && count !== 0
      },
      { timeout: this.config.timeouts.filteredResults },
      UNFILTERED_COUNT
    )
  }

  async getResultsHeadingText() {
    const heading = this.page.locator(SELECTORS.resultsHeading)
    return await heading.first().textContent()
  }

  async isResultsHeadingVisible() {
    try {
      const heading = this.page.locator(SELECTORS.resultsHeading)
      await heading.first().waitFor({ state: 'visible', timeout: this.config.timeouts.elementVisibility })
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
