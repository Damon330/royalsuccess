export interface DeviceInfo {
  manufacturer: string
  model: string
}

// Looks up device make/model from a 15-digit IMEI using the public GSMA TAC database.
// Silently returns null on CORS failure, timeout, or unknown TAC — caller treats it as optional enrichment.
export async function lookupByIMEI(imei: string): Promise<DeviceInfo | null> {
  if (!/^\d{15}$/.test(imei)) return null
  const tac = imei.slice(0, 8)
  try {
    // Route through our own API to avoid CORS — falls back to direct call in local dev
    const url = `/api/imei-lookup?tac=${tac}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = (await res.json()) as { manufacturer?: string; model?: string } | null
    if (!data || (!data.manufacturer && !data.model)) return null
    return {
      manufacturer: data.manufacturer ?? '',
      model:        data.model        ?? '',
    }
  } catch {
    return null
  }
}
