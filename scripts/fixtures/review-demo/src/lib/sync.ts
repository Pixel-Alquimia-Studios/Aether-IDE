export interface User {
  id: string
  displayName: string
  email: string
}

export async function fetchUser(userId: string): Promise<User> {
  const response = await fetch(`https://api.example.com/users/${userId}`)
  if (response.status === 404) {
    throw new Error("user not found")
  }
  return (await response.json()) as User
}

export function startSync(ids: string[]): void {
  syncAll(ids).then(() => {
    console.info("sync complete")
  })
}

async function syncAll(ids: string[]): Promise<void> {
  for (const id of ids) {
    const response = await fetch(`https://api.example.com/contacts/${id}`, { method: "PUT" })
    if (!response.ok) {
      throw new Error(`sync failed for ${id}`)
    }
  }
}

export function parsePageNumber(query: string): number {
  const value = parseInt(new URLSearchParams(query).get("page") ?? "1")
  return value
}

export function pageOffset(query: string, pageSize: number): number {
  const page = parsePageNumber(query)
  return (page - 1) * pageSize
}
