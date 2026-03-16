import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js'

// k6 browser module uses its own metric names — remap them so the HTML reporter picks them up
function patchBrowserMetrics(data) {
  if (!data.metrics.http_reqs && data.metrics.browser_http_req_failed) {
    const total = data.metrics.browser_http_req_failed.values.fails + data.metrics.browser_http_req_failed.values.passes
    data.metrics.http_reqs = {
      type: 'counter', contains: 'default',
      values: { count: total, rate: total / (data.state.testRunDurationMs / 1000) }
    }
  }
  if (data.metrics.browser_data_received) data.metrics.data_received = data.metrics.browser_data_received
  if (data.metrics.browser_data_sent) data.metrics.data_sent = data.metrics.browser_data_sent
}

export function generateReport(data) {
  patchBrowserMetrics(data)
  return {
    // actually the report name should be something like report.html, 
    // but i have renamed it to index.html so that gh-pages can serve it by default without any extra config
    'index.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true })
  }
}
