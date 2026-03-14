// Collects VU metrics and logs a single summary line per VU

export class VULogger {
  constructor(vu, course) {
    this.data = { vu, course }
  }

  setSearchTime(ms) {
    this.data.searchTime = `${ms}ms`
  }

  setResults(text) {
    this.data.results = text
  }

  setAssertion(passed) {
    this.data.assertion = passed ? 'PASS' : 'FAIL'
  }

  setFCP(ms) {
    this.data.fcp = `${ms.toFixed(0)}ms`
  }

  setLCP(ms) {
    this.data.lcp = `${ms.toFixed(0)}ms`
  }

  flush() {
    const d = this.data
    console.log(
      `VU ${d.vu} | course: ${d.course} | search: ${d.searchTime} | ${d.results} | assertion: ${d.assertion} | FCP: ${d.fcp || 'N/A'} | LCP: ${d.lcp || 'N/A'}`
    )
  }
}
