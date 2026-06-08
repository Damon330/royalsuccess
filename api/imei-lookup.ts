import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { tac } = req.query
  if (!tac || typeof tac !== 'string' || !/^\d{8}$/.test(tac)) {
    return res.status(400).json({ error: 'Invalid TAC' })
  }

  try {
    const upstream = await fetch(`https://tacdb.osmocom.org/tac/${tac}.json`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    })
    if (!upstream.ok) return res.status(404).json(null)
    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json(data)
  } catch {
    return res.status(502).json(null)
  }
}
