// Programmatic cash-register sound using Web Audio API.
// No external files needed. Browsers require a prior user gesture before
// AudioContext can play — call primeAudioContext() on first click.

let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    // Resume on any user interaction so Safari / iOS don't block playback
    document.addEventListener('click', () => _ctx?.resume(), { once: true })
  }
  return _ctx
}

export function primeAudioContext() {
  getCtx().resume()
}

// Short two-note ping — used for new user signups / general alerts
export function playAlertSound() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') { ctx.resume() }

    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)          // A5
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12)  // D6
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // Silently ignore
  }
}

export function playSaleSound() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') { ctx.resume() }

    // First tone — bright ding (C6 → E6)
    const osc1  = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.frequency.setValueAtTime(1046, ctx.currentTime)
    osc1.frequency.setValueAtTime(1318, ctx.currentTime + 0.1)
    gain1.gain.setValueAtTime(0.4, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.4)

    // Second tone — higher ding (G6) — cash-register feel
    const osc2  = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.frequency.setValueAtTime(1568, ctx.currentTime + 0.15)
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.5)
  } catch {
    // Silently ignore — AudioContext blocked or not supported
  }
}
