import { useEffect, useState } from "react"
import { fetchUser, type User } from "../lib/sync"

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUser(userId).then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    void track("profile_view", { userId })
  }, [userId])

  if (loading || !user) return <p>Loading…</p>
  return (
    <section>
      <h2>{user.displayName}</h2>
      <p>{user.email}</p>
    </section>
  )
}

function track(event: string, payload: Record<string, string>): Promise<void> {
  return fetch("https://telemetry.example.com/events", {
    method: "POST",
    body: JSON.stringify({ event, payload }),
  }).then(() => undefined)
}
