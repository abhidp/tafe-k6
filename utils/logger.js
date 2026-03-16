// just for debuggin and logging locally and demo purposes - not needed for production
export function logVU({ vu, course, searchMs, results, passed, fcp, lcp }) {
  const fmt = (ms) => (ms != null ? `${Math.round(ms)}ms` : 'N/A')
  console.log(
    `VU ${vu} | course: ${course} | search: ${fmt(searchMs)} | ${results} | assertion: ${passed ? 'PASS' : 'FAIL'} | FCP: ${fmt(fcp)} | LCP: ${fmt(lcp)}`
  )
}
