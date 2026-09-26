import { useEffect, useState } from 'react'

// One point of contact with the backend. Every request goes through
// apiFetch so the base path, the demo key, the investigator header and the
// error wording live in exactly one place (thirteen bare fetch() calls had
// drifted, and five of them swallowed errors silently).

export const INVESTIGATOR_KEY = 'crimelink_investigator'
const DEMO_API_KEY = 'demo-investigator-key'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function investigatorName() {
  try {
    return localStorage.getItem(INVESTIGATOR_KEY) || ''
  } catch {
    return ''
  }
}

function messageFor(status, data) {
  if (data && typeof data.detail === 'string') return data.detail
  if (status === 401) return 'errAuth'
  if (status === 404) return 'errNotFound'
  if (status === 422) return 'errInvalid'
  return 'errServer'
}

export async function apiFetch(path, { method = 'GET', json, form, signal } = {}) {
  const headers = {}
  if (method !== 'GET') {
    headers['X-API-Key'] = DEMO_API_KEY
    headers['X-Investigator-Name'] = investigatorName()
  }
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }

  let res
  try {
    res = await fetch(path, { method, headers, body, signal })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('errNetwork', 0)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body: status decides */
  }
  if (!res.ok) throw new ApiError(messageFor(res.status, data), res.status)
  if (data && typeof data.error === 'string') throw new ApiError(data.error, res.status)
  return data
}

// GET with loading/error state. `refreshKey` re-fetches when it changes;
// a changed path or unmount aborts the request in flight so a slow answer
// for the previous record can never overwrite the current one.
export function useApi(path, refreshKey = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: path != null })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (path == null) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    const controller = new AbortController()
    setState({ data: null, error: null, loading: true })
    apiFetch(path, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (e.name === 'AbortError') return
        setState({ data: null, error: e.message, loading: false })
      })
    return () => controller.abort()
  }, [path, refreshKey, retry])

  return { ...state, reload: () => setRetry((n) => n + 1) }
}
