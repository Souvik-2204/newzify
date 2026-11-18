// Keep rapid back-to-back local suites inside the normal application limits.
// Never disable auth or rate limiting, or impersonate another client address.
export async function reserveWindow(url, needed) {
  const r = await fetch(url + '/api/health', { method: 'HEAD' });
  const header = r.headers.get('ratelimit') || '';
  const left = Number(header.match(/remaining=(\d+)/)?.[1]);
  const seconds = Number(header.match(/reset=(\d+)/)?.[1] || r.headers.get('retry-after'));
  if (Number.isFinite(left) && left < needed && seconds > 0 && seconds <= 60) {
    console.log(`Waiting ${seconds}s for the local API request window.`);
    await new Promise((ok) => setTimeout(ok, (seconds + 1) * 1000));
  }
}
