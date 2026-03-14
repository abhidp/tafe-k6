// Page Object: TAFE NSW Home Page (tafensw.edu.au)

const SELECTORS = {
  searchInput: 'input[id="homePageSearch"]',
  searchButton: '[aria-label="Submit search"]'
}

export class HomePage {
  constructor(page, config) {
    this.page = page
    this.config = config
  }

  async navigate() {
    await this.page.goto(this.config.baseUrl, {
      waitUntil: 'networkidle',
      timeout: this.config.timeouts.navigation
    })
  }

  async searchForCourse(courseName) {
    const input = this.page.locator(SELECTORS.searchInput)
    await input.first().click()
    await input.first().type(courseName, { delay: 50 })

    const button = this.page.locator(SELECTORS.searchButton)
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: this.config.timeouts.search }),
      button.first().click()
    ])
  }
}
