// 个性化：主题强调色 + 自定义背景图的运行时应用
// 配置存于 config.bgImage / config.accentColor，Settings 修改后派发 'nal-personalize' 事件触发重载

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex: '#' + m[1].toLowerCase() }
}

// 应用强调色：覆盖 global.css 里的四个变量（空值则恢复默认）
export function applyAccent(hex) {
  const root = document.documentElement
  const c = hexToRgb(hex)
  if (!c) {
    for (const k of ['--accent', '--accent-hover', '--accent-dim', '--accent-glow']) root.style.removeProperty(k)
    return
  }
  const lighten = (v) => Math.min(255, Math.round(v + (255 - v) * 0.15))
  const toHex = (v) => v.toString(16).padStart(2, '0')
  root.style.setProperty('--accent', c.hex)
  root.style.setProperty('--accent-hover', `#${toHex(lighten(c.r))}${toHex(lighten(c.g))}${toHex(lighten(c.b))}`)
  root.style.setProperty('--accent-dim', `rgba(${c.r}, ${c.g}, ${c.b}, 0.15)`)
  root.style.setProperty('--accent-glow', `rgba(${c.r}, ${c.g}, ${c.b}, 0.4)`)
}

// 从主进程读配置并应用；返回背景图 data URL（无则 null）
export async function loadPersonalization() {
  try {
    const cfg = await window.nal.config.getAll()
    applyAccent(cfg.accentColor || '')
    if (cfg.bgImage) {
      const bg = await window.nal.config.getBgImage()
      return bg || null
    }
  } catch { /* 忽略：个性化失败不影响主流程 */ }
  return null
}

export function notifyPersonalizeChanged() {
  window.dispatchEvent(new Event('nal-personalize'))
}
