/** Minimal typed fetch client for the hub API. */

export const fetchJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(path)
  const body: unknown = await res.json()
  if (!res.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : res.statusText
    throw new Error(message)
  }
  return body as T
}
