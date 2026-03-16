export class VULogger {
  constructor(vu, course) {
    this.d = { vu, course }
  }

  setSearchTime(ms) { this.d.search = `${ms}ms` }
  setResults(text) { this.d.results = text }
  setAssertion(passed) { this.d.assert = passed ? 'PASS' : 'FAIL' }
  setFCP(ms) { this.d.fcp = `${ms.toFixed(0)}ms` }
  setLCP(ms) { this.d.lcp = `${ms.toFixed(0)}ms` }

  flush() {
    const d = this.d
    console.log(`VU ${d.vu} | course: ${d.course} | search: ${d.search} | ${d.results} | assertion: ${d.assert} | FCP: ${d.fcp || 'N/A'} | LCP: ${d.lcp || 'N/A'}`)
  }
}
