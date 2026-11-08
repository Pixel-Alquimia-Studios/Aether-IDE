const API_URL = "https://api.payments.example.com/v1/charges"

export interface Charge {
  userId: string
  amountCents: number
  currency: string
}

export async function createCharge(charge: Charge): Promise<{ id: string }> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer demo-secret-do-not-use-1234",
    },
    body: JSON.stringify(charge),
  })
  return (await response.json()) as { id: string }
}
