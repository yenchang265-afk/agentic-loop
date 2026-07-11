/** Minimal typed fetch client for the hub API. */

const parse = async <T>(res: Response): Promise<T> => {
  const body: unknown = await res.json()
  if (!res.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : res.statusText
    throw new Error(message)
  }
  return body as T
}

export const fetchJson = async <T>(path: string): Promise<T> => parse(await fetch(path))

/** POST with the mutating-route header (the hub's CSRF token-of-intent). */
export const postJson = async <T>(path: string, body: unknown): Promise<T> =>
  parse(
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Hub-Client": "1" },
      body: JSON.stringify(body),
    }),
  )
