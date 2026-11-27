// 全局 AI 悬浮窗：可拖拽的悬浮球 + 可拖动的对话面板，复用内置免费 AI 通道
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useConfigStore } from '../stores/config.js'
import { VOCALOID_CHARACTERS, getVocaloidCharacter } from './VocaloidCharacters.jsx'

const SYSTEM_PROMPT = {
  role: 'system',
  content: '你是 NUO OS 的悬浮 AI 助手。请用简洁清晰的中文回答，面向 Minecraft 玩家和启动器用户。可以使用 Markdown 排版，不要输出思考过程。',
}

const QUICK_PROMPTS = ['怎么安装 Forge？', '推荐几个优化模组', '联机失败怎么排查？']

const PANEL_W = 352
const PANEL_H = 470
const FAB_SIZE = 50
const FAB_KEY = 'nal.ai.float.fab'
const PANEL_KEY = 'nal.ai.float.panel'
const HISTORY_KEY = 'nal.ai.history.float'
const HISTORY_LIMIT = 60

// 术力口模式：Q 版头像轮播与俏皮话切换间隔
const AVATAR_SWITCH_MS = 2600
const SAY_SWITCH_MS = 9000

// 每次启动（打开窗口）只自动切换一次角色形态
let launchFormCycled = false

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((m) => m && m.role && typeof m.content === 'string') : []
  } catch {
    return []
  }
}

function clampPos(x, y) {
  const maxX = Math.max(8, window.innerWidth - PANEL_W - 8)
  const maxY = Math.max(8, window.innerHeight - PANEL_H - 8)
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) }
}

function clampFab(x, y) {
  const maxX = Math.max(8, window.innerWidth - FAB_SIZE - 8)
  const maxY = Math.max(8, window.innerHeight - FAB_SIZE - 8)
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) }
}

function defaultFabPos() {
  return clampFab(window.innerWidth - FAB_SIZE - 22, window.innerHeight - FAB_SIZE - 24)
}

function panelPosFor(fab) {
  return clampPos(fab.x + FAB_SIZE - PANEL_W, fab.y - PANEL_H - 10)
}

export default function AIFloating() {
  const location = useLocation()
  const config = useConfigStore((s) => s.config)
  const setConfigValue = useConfigStore((s) => s.set)
  const vocaloidMode = !!config?.vocaloidMode
  const character = getVocaloidCharacter(config?.vocaloidCharacter)
  const [open, setOpen] = useState(false)
  const [fab, setFab] = useState(null)
  const [pos, setPos] = useState(null)
  const [draggingFab, setDraggingFab] = useState(false)
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [sayLine, setSayLine] = useState('')

  const listRef = useRef(null)
  const messagesRef = useRef([])
  const activeRef = useRef(false)
  const dragRef = useRef(null)
  const fabRef = useRef(null)
  const fabDrag = useRef(null)
  const fabPosRef = useRef(null)

  const available = typeof window !== 'undefined' && !!window.nal?.ai
  const hidden = location.pathname === '/ai' || !available

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT))) } catch {}
  }, [messages])
  useEffect(() => { fabPosRef.current = fab }, [fab])

  // 换角色时从头开始轮播该角色的三张 Q 版图
  useEffect(() => { setAvatarIndex(0) }, [character.id])

  // 术力口模式：三张图轮流展示，给悬浮球一点小动作
  useEffect(() => {
    if (!vocaloidMode) return
    const total = character.avatars?.length || 1
    const timer = setInterval(() => {
      setAvatarIndex((i) => (i + 1) % total)
    }, AVATAR_SWITCH_MS)
    return () => clearInterval(timer)
  }, [vocaloidMode, character.id])

  // 术力口模式：悬浮球轮流冒出一句俏皮话
  useEffect(() => {
    if (!vocaloidMode) { setSayLine(''); return }
    const lines = character.playful?.length ? character.playful : character.lines
    let idx = Math.floor(Math.random() * lines.length)
    setSayLine(lines[idx])
    const timer = setInterval(() => {
      idx = (idx + 1) % lines.length
      setSayLine(lines[idx])
    }, SAY_SWITCH_MS)
    return () => clearInterval(timer)
  }, [vocaloidMode, character.id])

  // 每次打开应用窗口时自动切到下一位角色的形态（每次启动只执行一次）
  useEffect(() => {
    if (launchFormCycled) return
    if (config?.vocaloidCharacter === undefined) return
    launchFormCycled = true
    if (!config.vocaloidMode) return
    const i = VOCALOID_CHARACTERS.findIndex((c) => c.id === config.vocaloidCharacter)
    const next = VOCALOID_CHARACTERS[(i + 1) % VOCALOID_CHARACTERS.length]
    setConfigValue('vocaloidCharacter', next.id)
  }, [config, setConfigValue])

  // 切换到下一位角色（写回配置，同步主题与设置页）
  const cycleCharacter = () => {
    const i = VOCALOID_CHARACTERS.findIndex((c) => c.id === character.id)
    const next = VOCALOID_CHARACTERS[(i + 1) % VOCALOID_CHARACTERS.length]
    setConfigValue('vocaloidCharacter', next.id)
  }

  // 恢复悬浮球位置
  useEffect(() => {
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(FAB_KEY) || 'null') } catch {}
    setFab(saved ? clampFab(saved.x, saved.y) : defaultFabPos())
  }, [])

  // 窗口尺寸变化时把悬浮球和面板收回可视区
  useEffect(() => {
    const onResize = () => {
      setFab((f) => (f ? clampFab(f.x, f.y) : defaultFabPos()))
      setPos((p) => (p ? clampPos(p.x, p.y) : p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 订阅流式事件，只处理本窗口发起的请求
  useEffect(() => {
    if (!available) return
    const unsubDone = window.nal.ai.onDone((data) => {
      if (!activeRef.current) return
      activeRef.current = false
      setLoading(false)
      setStatus('')
      if (data.fullText) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.fullText }])
      }
    })
    const unsubError = window.nal.ai.onError((data) => {
      if (!activeRef.current) return
      activeRef.current = false
      setLoading(false)
      setStatus('')
      setError(data.error)
    })
    const unsubStatus = window.nal.ai.onStatus((data) => {
      if (!activeRef.current) return
      setStatus(data.status || '')
    })
    return () => { unsubDone(); unsubError(); unsubStatus() }
  }, [available])

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openPanel = () => {
    const base = fabPosRef.current || defaultFabPos()
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(PANEL_KEY) || 'null') } catch {}
    // 悬浮球被拖动过就贴着球展开；否则使用上次面板位置
    const moved = saved && Math.abs(saved.fabX - base.x) < 2 && Math.abs(saved.fabY - base.y) < 2
    setPos(moved ? clampPos(saved.x, saved.y) : panelPosFor(base))
    setOpen(true)
  }

  const handleSend = async (text) => {
    const value = (text ?? input).trim()
    if (!value || loading) return
    const history = [...messagesRef.current, { role: 'user', content: value }]
    setMessages(history)
    setInput('')
    setError('')
    setStatus('')
    setLoading(true)
    activeRef.current = true
    // 术力口模式：让当前角色用俏皮的语气回答
    const system = vocaloidMode
      ? {
        role: 'system',
        content: `你是 NUO OS 的 AI 助手，现在由「${character.name}」来接待用户。${character.persona} 请用简洁清晰的中文回答 Minecraft 和启动器相关问题，可以带一点俏皮的语气，但不要输出思考过程，也不要过度卖萌。`,
      }
      : SYSTEM_PROMPT
    try {
      await window.nal.ai.chat([system, ...history], { maxTokens: 1200, temperature: 0.7 })
    } catch (e) {
      activeRef.current = false
      setLoading(false)
      setError(e.message || String(e))
    }
  }

  const handleStop = () => {
    if (window.nal?.ai) window.nal.ai.cancel('ai-direct')
    activeRef.current = false
    setLoading(false)
    setStatus('')
  }

  const showNotice = (text, ms = 2500) => {
    setNotice(text)
    setTimeout(() => setNotice((cur) => (cur === text ? '' : cur)), ms)
  }

  const handleExport = async () => {
    const list = messagesRef.current
    if (!Array.isArray(list) || list.length === 0) {
      showNotice('没有可导出的对话')
      return
    }
    showNotice('正在导出...')
    try {
      const res = await window.nal.ai.export(list, 'nuo-ai-float')
      if (res?.success) showNotice('已导出到 ' + res.filePath)
      else showNotice(res?.error || '导出失败')
    } catch (e) {
      showNotice(e.message || '导出失败')
    }
  }

  // 悬浮球拖拽：位移超过 4px 视为拖动，否则视为点击打开
  const onFabPointerDown = (event) => {
    if (event.button !== 0) return
    const base = fabPosRef.current || defaultFabPos()
    fabDrag.current = {
      dx: event.clientX - base.x,
      dy: event.clientY - base.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onFabPointerMove = (event) => {
    const d = fabDrag.current
    if (!d) return
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) > 4) {
      d.moved = true
      setDraggingFab(true)
    }
    if (!d.moved) return
    setFab(clampFab(event.clientX - d.dx, event.clientY - d.dy))
  }

  const onFabPointerUp = (event) => {
    const d = fabDrag.current
    if (!d) return
    fabDrag.current = null
    setDraggingFab(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    if (!d.moved) {
      openPanel()
      return
    }
    const p = fabPosRef.current
    if (p) { try { localStorage.setItem(FAB_KEY, JSON.stringify(p)) } catch {} }
  }

  // 面板标题栏拖拽
  const startDrag = (event) => {
    if (event.button !== 0) return
    // 点在「清空 / 关闭」上时不要开始拖拽，否则指针捕获会把点击劫持到标题栏
    if (event.target.closest('.ai-float-actions')) return
    dragRef.current = { dx: event.clientX - (pos?.x || 0), dy: event.clientY - (pos?.y || 0) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDrag = (event) => {
    if (!dragRef.current) return
    setPos(clampPos(event.clientX - dragRef.current.dx, event.clientY - dragRef.current.dy))
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    setPos((p) => {
      if (p && fabPosRef.current) {
        try {
          localStorage.setItem(PANEL_KEY, JSON.stringify({ ...p, fabX: fabPosRef.current.x, fabY: fabPosRef.current.y }))
        } catch {}
      }
      return p
    })
  }

  if (hidden) return null

  // 悬浮球在右半边时，俏皮话气泡放到左侧，避免跑出屏幕
  const bubbleOnLeft = fab ? fab.x + FAB_SIZE / 2 > window.innerWidth / 2 : true
  const avatarSrc = character.avatars?.[avatarIndex] || character.avatars?.[0]

  return (
    <>
      {!open && fab && (
        <>
          {vocaloidMode && sayLine && (
            <div
              className={`ai-float-say ${bubbleOnLeft ? 'is-left' : 'is-right'}`}
              style={{ left: fab.x, top: fab.y + FAB_SIZE / 2 }}
              aria-live="polite"
            >
              {sayLine}
            </div>
          )}
          <button
            ref={fabRef}
            type="button"
            className={`ai-float-fab${draggingFab ? ' is-dragging' : ''}${vocaloidMode ? ' is-vocaloid' : ''}`}
            style={{ left: fab.x, top: fab.y }}
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerUp}
            onPointerCancel={onFabPointerUp}
            onContextMenu={(e) => { if (vocaloidMode) { e.preventDefault(); cycleCharacter() } }}
            aria-label={vocaloidMode ? `${character.name} AI 悬浮球（可拖动）` : 'AI 悬浮窗（可拖动）'}
            title={vocaloidMode ? `${character.name} · 点击聊天 · 右键换角色 · 拖动移动` : '点击打开 · 拖动可移动'}
          >
            {vocaloidMode && avatarSrc
              ? <img className="ai-float-fab-img" src={avatarSrc} alt={character.name} draggable={false} />
              : <Icon name="sparkles" size={20} />}
          </button>
          {vocaloidMode && (
            <button
              type="button"
              className="ai-float-switch"
              style={{ left: fab.x + FAB_SIZE - 16, top: fab.y + FAB_SIZE - 16 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={cycleCharacter}
              title={`切换下一位角色（当前：${character.name}）`}
              aria-label="切换角色"
            >
              <Icon name="refresh" size={11} />
            </button>
          )}
        </>
      )}

      {open && pos && (
        <section className="ai-float-panel" style={{ left: pos.x, top: pos.y }} aria-label="AI 悬浮窗">
          <header
            className="ai-float-head"
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="ai-float-title">
              {vocaloidMode && avatarSrc
                ? <img className="ai-float-head-avatar" src={avatarSrc} alt="" draggable={false} />
                : <Icon name="bot" size={15} />}
              {vocaloidMode ? character.name : 'AI 助手'}
            </span>
            <div className="ai-float-actions" onPointerDown={(e) => e.stopPropagation()}>
              {vocaloidMode && (
                <button type="button" onClick={cycleCharacter} title="切换下一位角色">换角色</button>
              )}
              <button type="button" onClick={handleExport} title="导出对话为 .md" disabled={messages.length === 0}>导出</button>
              <button type="button" onClick={() => { setMessages([]); setError(''); messagesRef.current = [] }} title="清空对话">清空</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭" title="关闭"><Icon name="close" size={14} /></button>
            </div>
          </header>

          <div className="ai-float-body" ref={listRef}>
            {notice && <div className="ai-float-notice">{notice}</div>}
            {messages.length === 0 && !loading && !error && (
              <div className="ai-float-empty">
                <div className="ai-float-empty-icon"><Icon name="sparkles" size={26} /></div>
                <p>{vocaloidMode ? `${character.name} 在这里，随时问我～` : '内置免费 AI 通道，随时问我任何问题。'}</p>
                <div className="ai-float-quick">
                  {QUICK_PROMPTS.map((q) => (
                    <button key={q} type="button" onClick={() => handleSend(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`ai-float-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
                <div className="ai-float-bubble">{m.content}</div>
              </div>
            ))}

            {loading && (
              <div className="ai-float-loading">
                <span className="spinner" /> {status || '思考中...'}
              </div>
            )}

            {error && <div className="ai-float-error"><Icon name="alert" size={13} /> {error}</div>}
          </div>

          <div className="ai-float-input">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? 'AI 正在回复...' : '问点什么，Enter 发送'}
              rows={1}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
            />
            {loading ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={handleStop}>停止</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSend()} disabled={!input.trim()}>发送</button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
