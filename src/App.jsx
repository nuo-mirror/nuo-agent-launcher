import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import HomePage from './pages/Home.jsx'
import DownloadPage from './pages/Download.jsx'
import ModsPage from './pages/Mods.jsx'
import ContentPage from './pages/Content.jsx'
import MultiplayerPage from './pages/Multiplayer.jsx'
import AIPage from './pages/AI.jsx'
import LogsPage from './pages/Logs.jsx'
import SettingsPage from './pages/Settings.jsx'
import AboutPage from './pages/About.jsx'
import DeveloperPage from './pages/Developer.jsx'
import ColorsPage from './pages/Colors.jsx'
// 种子查看器体积较大（deepslate 世界生成库），懒加载减小首屏 JS
const SeedsPage = lazy(() => import('./pages/Seeds.jsx'))
import { applyCustomColors } from './utils/themeColors.js'
import { useConfigStore } from './stores/config.js'
import { useUpdaterStore, isDownloading } from './stores/updater.js'
import { loadPersonalization } from './utils/personalize.js'
import { makeSequenceDetector, KONAMI, HEROBRINE } from './utils/easterEggs.js'
import Icon from './components/Icon.jsx'
import navMapTex from './assets/mc/navmap.png'
import pkg from '../package.json'

// 当前客户端版本（直接读 package.json，避免手动同步遗漏）
const APP_VERSION = pkg.version

const BASE_NAV_ITEMS = [
  { to: '/', label: '主页', icon: 'home' },
  { to: '/download', label: '下载', icon: 'download' },
  { to: '/mods', label: '模组', icon: 'mods' },
  { to: '/content', label: '资源', icon: 'folder' },
  { to: '/seeds', label: '种子查看器', icon: 'map', img: navMapTex },
  { to: '/multiplayer', label: '联机', icon: 'users' },
  { to: '/ai', label: 'AI 助手', icon: 'ai' },
  { to: '/logs', label: '日志/记录', icon: 'logs' },
  { to: '/settings', label: '设置', icon: 'settings' },
  { to: '/about', label: '关于', icon: 'info' },
  // 开发者模块：与其他模块一样常驻侧边栏，进入时需要密码
  { to: '/developer', label: '开发者', icon: 'code' },
]

// 开发者模式开启后额外解锁的菜单项（独立配色页）
const DEV_NAV_ITEMS = [
  { to: '/colors', label: '配色', icon: 'palette' },
]

function NavItem({ to, label, icon, img, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-icon">{img
        ? <img src={img} width={20} height={20} alt="" style={{ imageRendering: 'pixelated', display: 'block' }} />
        : <Icon name={icon} size={20} />}</span>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [appDir, setAppDir] = useState('')
  const [updateError, setUpdateError] = useState('')
  const config = useConfigStore()
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const clearUpdate = useUpdaterStore((s) => s.clearUpdate)
  const setUpdateInfo = useUpdaterStore((s) => s.setUpdateInfo)
  const download = useUpdaterStore((s) => s.download)
  const setDownload = useUpdaterStore((s) => s.setDownload)
  const downloading = isDownloading(download)
  // 主题直接从 config store 读取，切换时实时响应
  const theme = useConfigStore((s) => s.config?.theme) || 'dark'
  // 开发者模式：开启后导航栏在“开发者”后面追加“配色”菜单项
  const devMode = !!useConfigStore((s) => s.config?.devMode)
  const navItems = devMode
    ? [...BASE_NAV_ITEMS, ...DEV_NAV_ITEMS]
    : BASE_NAV_ITEMS

  // 彩蛋 toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4200)
  }
  const logoClicks = useRef({ count: 0, time: 0 })
  const onLogoClick = () => {
    const now = Date.now()
    const s = logoClicks.current
    if (now - s.time > 3000) s.count = 0
    s.time = now
    s.count++
    if (s.count === 7) {
      s.count = 0
      showToast('你发现了隐藏彩蛋！其实并没有奖励，但你找到了。')
    }
  }
  // 按键彩蛋：科乐美秘籍 = 派对模式；输入 herobrine = 经典梗
  useEffect(() => {
    const konami = makeSequenceDetector(KONAMI, () => {
      showToast('派对模式启动！8 秒后恢复原样……')
      let deg = 0
      const t = setInterval(() => {
        deg = (deg + 12) % 360
        document.body.style.filter = `hue-rotate(${deg}deg)`
      }, 80)
      setTimeout(() => { clearInterval(t); document.body.style.filter = '' }, 8000)
    })
    const hero = makeSequenceDetector(HEROBRINE, () => {
      showToast('Herobrine has been removed. ……大概吧。')
    })
    const onKey = (e) => {
      if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName)) return
      const k = (e.key || '').toLowerCase()
      konami(k)
      hero(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const all = await window.nal.config.getAll()
        config.setAll(all || {})
        const dir = await window.nal.system.getAppDir()
        setAppDir(dir)
      } catch (e) {
        console.error('Init config failed:', e)
      } finally {
        setReady(true)
      }
    })()

    const unsubLog = window.nal.logs?.onNewLog?.(() => {})
    return () => unsubLog?.()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 个性化：自定义背景图 + 主题强调色（Settings 修改后通过事件触发重载）
  const [bgImage, setBgImage] = useState(null)
  useEffect(() => {
    let alive = true
    const reload = async () => {
      const bg = await loadPersonalization()
      if (alive) setBgImage(bg)
    }
    reload()
    window.addEventListener('nal-personalize', reload)
    return () => { alive = false; window.removeEventListener('nal-personalize', reload) }
  }, [])
  useEffect(() => {
    const body = document.body
    if (bgImage) {
      const overlay = theme === 'light' ? 'rgba(244, 246, 250, 0.88)' : 'rgba(13, 17, 23, 0.86)'
      body.style.backgroundImage = `linear-gradient(${overlay}, ${overlay}), url("${bgImage}")`
      body.style.backgroundSize = 'cover'
      body.style.backgroundPosition = 'center'
      body.style.backgroundAttachment = 'fixed'
    } else {
      body.style.backgroundImage = ''
      body.style.backgroundSize = ''
      body.style.backgroundPosition = ''
      body.style.backgroundAttachment = ''
    }
  }, [bgImage, theme])

  // 监听主进程启动时静默检查到的新版本 + 自更新下载进度
  useEffect(() => {
    const unsub = window.nal.updater?.onUpdateAvailable?.((info) => {
      if (info?.hasUpdate) setUpdateInfo(info)
    })
    const unsubProgress = window.nal.updater?.onDownloadProgress?.((d) => {
      if (d) setDownload(d)
    })
    return () => { unsub?.(); unsubProgress?.() }
  }, [])

  // 横幅"一键更新"：应用内下载并自动安装
  const handleUpdateNow = async () => {
    setUpdateError('')
    const res = await window.nal.updater?.downloadAndInstall?.().catch((e) => ({ success: false, error: e.message }))
    if (!res?.success) setUpdateError(res?.error || '更新失败，请稍后重试')
  }

  const fmtSpeed = (b) => {
    if (!b) return ''
    if (b >= 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB/s`
    return `${(b / 1024).toFixed(0)} KB/s`
  }

  // 应用自定义配色（通过注入 <style>：强调色全局生效，背景类仅深色主题生效）
  const customColors = useConfigStore((s) => s.config?.customColors)
  useEffect(() => {
    applyCustomColors(customColors)
  }, [customColors])

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <div className="text-secondary text-sm">正在加载 NUO OS...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo" onClick={onLogoClick} style={{ cursor: 'default', userSelect: 'none' }}>
            <div className="logo-mark">N</div>
            <div className="logo-text">
              <div className="logo-title">nuo agent</div>
              <div className="logo-subtitle">launcher</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} end={item.to === '/'} />
          ))}
        </nav>
        <div className="sidebar-footer">
          {devMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
              padding: '4px 10px', borderRadius: 999, width: 'fit-content',
              fontSize: 11, fontWeight: 600,
              background: 'var(--success-dim, rgba(16,185,129,0.12))', color: 'var(--success)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              开发者模式
            </div>
          )}
          <div className="version-badge">v{APP_VERSION}</div>
        </div>
      </aside>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: 'var(--bg-secondary, #161b22)', color: 'var(--text-primary, #e6edf3)',
          border: '1px solid var(--accent, #4f9eff)', borderRadius: 10,
          padding: '12px 18px', fontSize: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
          animation: 'nal-toast-in 0.25s ease-out',
        }}>
          {toast}
          <style>{'@keyframes nal-toast-in { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }'}</style>
        </div>
      )}
      <main className="main-content">
        {updateInfo && (
          <div className="update-banner">
            <div className="update-banner-body">
              <span className="update-banner-icon"><Icon name="gift" size={20} /></span>
              <div>
                <strong>发现新版本 v{updateInfo.latest}</strong>
                <span className="update-banner-current">（当前 v{updateInfo.current}）</span>
                <div className="update-banner-name">{updateInfo.release?.name || ''}</div>
              </div>
            </div>
            <div className="update-banner-actions">
              {downloading ? (
                <>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{download?.message || '正在准备更新...'}</span>
                      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        {download?.speed ? fmtSpeed(download.speed) : ''}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(3, download?.percent || 0)}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width .3s ease' }} />
                    </div>
                  </div>
                  {['check', 'probe', 'download'].includes(download?.phase) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => window.nal.updater.cancelDownload()}>取消</button>
                  )}
                </>
              ) : (
                <>
                  <button className="btn btn-primary btn-sm" onClick={handleUpdateNow}>一键更新</button>
                  <button className="btn btn-ghost btn-sm" onClick={clearUpdate}>稍后</button>
                </>
              )}
            </div>
            {updateError && !downloading && (
              <div className="text-xs" style={{ color: 'var(--error)', width: '100%', marginTop: 4 }}>{updateError}</div>
            )}
          </div>
        )}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/mods" element={<ModsPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/seeds" element={<Suspense fallback={null}><SeedsPage /></Suspense>} />
          <Route path="/multiplayer" element={<MultiplayerPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/developer" element={<DeveloperPage />} />
          <Route path="/colors" element={<ColorsPage />} />
        </Routes>
      </main>
      <style>{`
        .app-shell { display: flex; height: 100%; }
        .sidebar {
          width: var(--sidebar-width);
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        .sidebar-header { padding: 20px 16px; border-bottom: 1px solid var(--border-color); }
        .logo { display: flex; align-items: center; gap: 10px; }
        .logo-mark {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, var(--accent), #7c4dff);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 700; font-size: 18px;
          box-shadow: 0 4px 12px var(--accent-glow);
        }
        .logo-title { font-size: 14px; font-weight: 600; }
        .logo-subtitle { font-size: 11px; color: var(--text-tertiary); }
        .sidebar-nav { flex: 1; padding: 12px 8px; overflow-y: auto; }
        .nav-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: var(--radius);
          color: var(--text-secondary); font-size: 14px;
          transition: all var(--transition); margin-bottom: 2px;
        }
        .nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .nav-item.active {
          background: var(--accent-dim); color: var(--accent);
          font-weight: 500;
        }
        .nav-icon { width: 20px; height: 20px; display: flex; flex-shrink: 0; }
        .nav-icon svg { width: 100%; height: 100%; }
        .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border-color); }
        .version-badge { font-size: 11px; color: var(--text-muted); }
        .main-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .main-content > div:not(.update-banner) { flex: 1; min-height: 0; }
        .update-banner {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 18px;
          background: linear-gradient(90deg, var(--accent-dim), transparent);
          border-bottom: 1px solid var(--accent);
          animation: bannerSlide .35s ease;
        }
        @keyframes bannerSlide { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .update-banner-body { display: flex; align-items: center; gap: 12px; font-size: 13.5px; }
        .update-banner-icon { font-size: 20px; }
        .update-banner-current { color: var(--text-secondary); font-size: 12px; margin-left: 6px; }
        .update-banner-name { color: var(--text-tertiary); font-size: 12px; }
        .update-banner-actions { display: flex; gap: 8px; flex-shrink: 0; }
      `}</style>
    </div>
  )
}
