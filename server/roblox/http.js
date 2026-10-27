const UA = 'robux-dashboard/1.0 (local)';

export class ApiError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} en ${url}${body ? ` — ${String(body).slice(0, 180)}` : ''}`);
    this.status = status;
    this.url = url;
  }
}

/** fetch con timeout, cabeceras por defecto y parseo JSON. */
export async function getJson(url, { headers = {}, method = 'GET', body, timeoutMs = 15000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ac.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, url, text);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}
