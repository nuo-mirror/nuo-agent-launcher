// 术力口模式 BGM：Web Audio API 实时合成 chiptune 电子音乐
// 无需外部音频文件，无版权问题。提供 3 首原创循环曲目。
// 音色：方波主旋律 + 三角波低音 + 噪声鼓点，模拟 VOCALOID 电子风格。

// ===== 音符频率表 =====
const N = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.5, D6: 1174.7, E6: 1318.5,
}

// ===== 曲目定义 =====
// 格式：{ name, bpm, melody: [[note, beats], ...], bass: [[note, beats], ...] }
// note 为频率数值，0 = 休止符
const TRACKS = [
  {
    name: 'Miku Dance',
    bpm: 128,
    melody: [
      [N.E5, 0.5], [N.G5, 0.5], [N.A5, 0.5], [N.B5, 0.5],
      [N.A5, 0.5], [N.G5, 0.5], [N.E5, 0.5], [N.D5, 0.5],
      [N.E5, 0.5], [N.G5, 0.5], [N.A5, 1],
      [0, 0.5], [N.E5, 0.5],
      [N.D5, 0.5], [N.E5, 0.5], [N.G5, 0.5], [N.E5, 0.5],
      [N.D5, 0.5], [N.C5, 0.5], [N.D5, 0.5], [N.E5, 0.5],
      [N.G5, 1], [N.E5, 1],
      [0, 1],
      [N.A5, 0.5], [N.B5, 0.5], [N.C6, 0.5], [N.B5, 0.5],
      [N.A5, 0.5], [N.G5, 0.5], [N.A5, 0.5], [N.B5, 0.5],
      [N.A5, 1], [N.G5, 0.5], [N.E5, 0.5],
      [N.D5, 1], [N.E5, 1],
    ],
    bass: [
      [N.C3, 1], [N.C3, 1], [N.G3, 1], [N.G3, 1],
      [N.A3, 1], [N.A3, 1], [N.E3, 1], [N.E3, 1],
      [N.F3, 1], [N.F3, 1], [N.C3, 1], [N.C3, 1],
      [N.G3, 1], [N.G3, 1], [N.C3, 1], [N.C3, 1],
    ],
  },
  {
    name: 'Digital Dream',
    bpm: 100,
    melody: [
      [N.C5, 1], [N.E5, 0.5], [N.G5, 0.5], [N.E5, 1],
      [N.D5, 0.5], [N.C5, 0.5], [N.D5, 1],
      [N.E5, 1], [N.G5, 0.5], [N.A5, 0.5], [N.G5, 1],
      [N.E5, 1], [N.D5, 1],
      [N.C5, 0.5], [N.D5, 0.5], [N.E5, 0.5], [N.G5, 0.5],
      [N.A5, 1], [N.G5, 0.5], [N.E5, 0.5], [N.D5, 1],
      [N.C5, 1], [N.E5, 1], [N.D5, 2],
    ],
    bass: [
      [N.C3, 2], [N.G3, 2], [N.A3, 2], [N.E3, 2],
      [N.F3, 2], [N.C3, 2], [N.G3, 2], [N.C3, 2],
    ],
  },
  {
    name: 'Electric Leek',
    bpm: 140,
    melody: [
      [N.G4, 0.25], [N.A4, 0.25], [N.B4, 0.25], [N.C5, 0.25],
      [N.D5, 0.25], [N.E5, 0.25], [N.D5, 0.25], [N.C5, 0.25],
      [N.B4, 0.25], [N.A4, 0.25], [N.G4, 0.25], [N.A4, 0.25],
      [N.B4, 0.5], [N.C5, 0.5],
      [N.D5, 0.25], [N.E5, 0.25], [N.F5, 0.25], [N.G5, 0.25],
      [N.A5, 0.25], [N.G5, 0.25], [N.F5, 0.25], [N.E5, 0.25],
      [N.D5, 0.25], [N.C5, 0.25], [N.B4, 0.25], [N.A4, 0.25],
      [N.G4, 0.5], [0, 0.5],
      [N.E5, 0.25], [N.E5, 0.25], [N.E5, 0.25], [N.D5, 0.25],
      [N.C5, 0.25], [N.D5, 0.25], [N.E5, 0.5],
      [N.G5, 0.25], [N.G5, 0.25], [N.G5, 0.25], [N.F5, 0.25],
      [N.E5, 0.25], [N.D5, 0.25], [N.C5, 0.5],
      [N.D5, 0.25], [N.E5, 0.25], [N.D5, 0.25], [N.C5, 0.25],
      [N.B4, 0.25], [N.C5, 0.25], [N.D5, 0.5],
      [N.G4, 0.5], [0, 0.5],
    ],
    bass: [
      [N.G3, 0.5], [N.G3, 0.5], [N.D3, 0.5], [N.D3, 0.5],
      [N.E3, 0.5], [N.E3, 0.5], [N.C3, 0.5], [N.C3, 0.5],
      [N.G3, 0.5], [N.G3, 0.5], [N.D3, 0.5], [N.D3, 0.5],
      [N.C3, 0.5], [N.C3, 0.5], [N.G3, 0.5], [N.G3, 0.5],
    ],
  },
]

// ===== 播放器 =====
class VocaloidPlayer {
  constructor() {
    this.ctx = null
    this.playing = false
    this.trackIndex = 0
    this.timer = null
    this.masterGain = null
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 0.15
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  _playNote(freq, startTime, duration, type = 'square', volume = 0.3) {
    if (!freq || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    // 简单 ADSR 包络
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
    gain.gain.setValueAtTime(volume, startTime + duration * 0.6)
    gain.gain.linearRampToValueAtTime(0, startTime + duration * 0.95)
    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(startTime)
    osc.stop(startTime + duration)
  }

  _playDrum(startTime, volume = 0.15) {
    if (!this.ctx) return
    // 用噪声模拟鼓点
    const bufferSize = this.ctx.sampleRate * 0.05
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
    }
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(this.masterGain)
    source.start(startTime)
  }

  _scheduleTrack() {
    if (!this.playing || !this.ctx) return
    const track = TRACKS[this.trackIndex]
    const beatLen = 60 / track.bpm
    const now = this.ctx.currentTime + 0.05

    // 主旋律
    let t = now
    for (const [freq, beats] of track.melody) {
      const dur = beats * beatLen
      if (freq > 0) this._playNote(freq, t, dur, 'square', 0.25)
      t += dur
    }

    // 低音线
    let bt = now
    for (const [freq, beats] of track.bass) {
      const dur = beats * beatLen
      if (freq > 0) this._playNote(freq, bt, dur, 'triangle', 0.2)
      bt += dur
    }

    // 鼓点（每拍一下）
    const totalBeats = track.melody.reduce((s, [, b]) => s + b, 0)
    for (let i = 0; i < totalBeats; i++) {
      this._playDrum(now + i * beatLen, i % 4 === 0 ? 0.2 : 0.08)
    }

    // 循环调度
    const totalDur = totalBeats * beatLen * 1000
    this.timer = setTimeout(() => this._scheduleTrack(), totalDur - 100)
  }

  start(trackIndex) {
    this._ensureCtx()
    this.trackIndex = typeof trackIndex === 'number' ? trackIndex : this.trackIndex
    if (this.playing) return
    this.playing = true
    this._scheduleTrack()
  }

  stop() {
    this.playing = false
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend()
  }

  next() {
    const wasPlaying = this.playing
    this.stop()
    this.trackIndex = (this.trackIndex + 1) % TRACKS.length
    if (wasPlaying) this.start()
    return this.trackIndex
  }

  prev() {
    const wasPlaying = this.playing
    this.stop()
    this.trackIndex = (this.trackIndex - 1 + TRACKS.length) % TRACKS.length
    if (wasPlaying) this.start()
    return this.trackIndex
  }

  getTrackName() {
    return TRACKS[this.trackIndex]?.name || ''
  }

  getTrackList() {
    return TRACKS.map((t, i) => ({ index: i, name: t.name }))
  }

  destroy() {
    this.stop()
    if (this.ctx) { this.ctx.close(); this.ctx = null }
  }
}

// 单例
const player = new VocaloidPlayer()
export default player
export { TRACKS }
