
export class SoundSystem {
  private ctx: any = null
  private enabled: boolean = true

  constructor() {
    this.init()
  }

  private init() {
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          this.ctx = new AudioCtx()
        }
      }
    } catch (e) {
      this.enabled = false
    }
  }

  private resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  playLaser() {
    if (!this.enabled || !this.ctx) return
    this.resume()
    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.12)

      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.12)
    } catch {}
  }

  playEnemyLaser() {
    if (!this.enabled || !this.ctx) return
    this.resume()
    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'square'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.1)

      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.1)
    } catch {}
  }

  playExplosion(big: boolean = false) {
    if (!this.enabled || !this.ctx) return
    this.resume()
    try {
      const duration = big ? 0.6 : 0.28
      const now = this.ctx.currentTime
      const bufferSize = Math.floor(this.ctx.sampleRate * duration)
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35))
      }

      const noise = this.ctx.createBufferSource()
      noise.buffer = buffer

      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(big ? 350 : 600, now)
      filter.frequency.linearRampToValueAtTime(50, now + duration)

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(big ? 0.35 : 0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

      noise.connect(filter)
      filter.connect(gain)
      gain.connect(this.ctx.destination)

      noise.start(now)
    } catch {}
  }

  playBomb() {
    if (!this.enabled || !this.ctx) return
    this.resume()
    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.8)

      gain.gain.setValueAtTime(0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.8)
      this.playExplosion(true)
    } catch {}
  }

  playPowerup() {
    if (!this.enabled || !this.ctx) return
    this.resume()
    try {
      const now = this.ctx.currentTime
      const notes = [330, 440, 660, 880]
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        const t = now + i * 0.06

        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, t)

        gain.gain.setValueAtTime(0.12, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)

        osc.connect(gain)
        gain.connect(this.ctx.destination)

        osc.start(t)
        osc.stop(t + 0.08)
      })
    } catch {}
  }
}
