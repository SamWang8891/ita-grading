/** Thin fetch wrapper that speaks JSON and preserves cookies. */

const API_BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

function buildUrl(path, query) {
  const base = API_BASE || window.location.origin
  const url = new URL(path, base.endsWith('/') ? base : base + '/')
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    }
  }
  return API_BASE ? url.toString() : url.toString().replace(window.location.origin, '')
}

async function request(method, path, { body, query, raw } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: {},
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(buildUrl(path, query), init)
  if (res.status === 204) return null
  const ctype = res.headers.get('content-type') || ''
  const payload = ctype.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const detail = typeof payload === 'object' && payload ? payload.detail : payload
    const err = new Error(typeof detail === 'string' ? detail : (detail?.msg ?? `HTTP ${res.status}`))
    err.status = res.status
    err.detail = detail
    throw err
  }
  return raw ? { payload, res } : payload
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
}

export async function downloadFile(path) {
  const res = await fetch(buildUrl(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const m = disposition.match(/filename="([^"]+)"/)
  const filename = m ? m[1] : 'download'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
