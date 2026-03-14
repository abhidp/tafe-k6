import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js'

// Patches browser-level metrics into protocol-level slots
// so the HTML reporter can display them correctly.
function patchBrowserMetrics(data) {
  // Browser tests don't generate http_reqs (protocol-level metric).
  // Patch it from browser_http_req_failed which tracks total browser requests.
  if (!data.metrics.http_reqs && data.metrics.browser_http_req_failed) {
    const total =
      data.metrics.browser_http_req_failed.values.fails +
      data.metrics.browser_http_req_failed.values.passes
    const duration = data.state.testRunDurationMs / 1000
    data.metrics.http_reqs = {
      type: 'counter',
      contains: 'default',
      values: { count: total, rate: total / duration }
    }
  }

  // Patch data_received/data_sent from browser equivalents
  if (data.metrics.browser_data_received) {
    data.metrics.data_received = data.metrics.browser_data_received
  }
  if (data.metrics.browser_data_sent) {
    data.metrics.data_sent = data.metrics.browser_data_sent
  }
}

export function generateReport(data) {
  patchBrowserMetrics(data)

  return {
    'report.html': htmlReport(data, {
      title: `TAFE NSW - Course Search Load Test Report : ${new Date().toLocaleString()}`
    }),
    stdout: textSummary(data, { indent: ' ', enableColors: true })
  }
}
