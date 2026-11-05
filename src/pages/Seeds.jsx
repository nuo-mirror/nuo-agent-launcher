// 种子查看器：本地 1.18+ multi-noise 群系地图（mcseedmap/chunkbase 风格）
// 顶部 Seed/Version/Dimension 三行 + Features 结构开关 chips；
// 大 Canvas 群系图（拖拽平移/滚轮缩放/坐标刻度/中心十字/悬停信息，离屏缓存 + 150ms 防抖分片渲染）；
// 史莱姆区块（全版本一致）；旧版本与旧维度跳转 Chunkbase
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Icon from '../components/Icon.jsx'
import {
  createClimate, getBiomeAt, getBiomeIdAt, findStructures, isSlimeChunk, STRUCTURE_TYPES,
} from '../utils/worldgen.js'
import { BIOME_INFO } from '../utils/biomeParams.js'

// Minecraft 原版像素纹理（1.21.4，© Mojang Studios）
import texVillage from '../assets/mc/village.png'
import texOutpost from '../assets/mc/outpost.png'
import texDesert from '../assets/mc/desert.png'
import texJungle from '../assets/mc/jungle.png'
import texSwamp from '../assets/mc/swamp.png'
import texIgloo from '../assets/mc/igloo.png'
import texMonument from '../assets/mc/monument.png'
import texMansion from '../assets/mc/mansion.png'
import texSlime from '../assets/mc/slime.png'

// 结构类型 -> 原版物品/方块纹理
const TEX = {
  village: texVillage,
  pillager_outpost: texOutpost,
  desert_pyramid: texDesert,
  jungle_pyramid: texJungle,
  swamp_hut: texSwamp,
  igloo: texIgloo,
  monument: texMonument,
  mansion: texMansion,
  slime: texSlime,
}

const MC_VERSIONS = [
  '1.21.4', '1.21.2', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20',
  '1.19.4', '1.19.3', '1.19.2', '1.19', '1.18.2', '1.18.1', '1.18', '1.17.1', '1.17',
  '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16', '1.15.2', '1.15.1', '1.15',
  '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14', '1.13.2', '1.13.1', '1.13',
  '1.12.2', '1.12.1', '1.12', '1.11.2', '1.11.1', '1.11', '1.10.2', '1.10',
  '1.9.4', '1.9', '1.8.9', '1.8', '1.7.10', '1.7.2', '1.6.4', '1.5.2',
  '1.4.7', '1.3.2', '1.2.5', '1.1', '1.0', 'Beta 1.8', 'Beta 1.7', 'Alpha',
]

const DIMENSIONS = [
  { id: 'overworld', name: '主世界' },
  { id: 'nether', name: '下界' },
  { id: 'end', name: '末地' },
]

// 群系数字 id -> [r,g,b] 预解析表（渲染热路径）
const BIOME_RGB = {}
for (const [id, info] of Object.entries(BIOME_INFO)) {
  const c = info.color
  BIOME_RGB[id] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
}
const FALLBACK_RGB = [122, 122, 122]

// 1.18+ 才有 multi-noise 群系生成
function is118plus(v) {
  if (!/^1\./.test(v)) return false
  return (Number(String(v).split('.')[1]) || 0) >= 18
}

// Java String.hashCode（按 UTF-16 码元，32 位溢出）
function javaHashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  }
  return h
}

// 与 Minecraft 一致的种子解析：纯数字 → long；文本 → 32 位 hashCode 符号扩展
function parseSeed(input) {
  const t = String(input || '').trim()
  if (t === '') return null
  if (/^[+-]?\d+$/.test(t)) {
    try { return BigInt.asIntN(64, BigInt(t)) } catch { /* 超出 long 按文本处理 */ }
  }
  return BigInt(javaHashCode(t))
}

function randomSeed() {
  const buf = new BigInt64Array(1)
  crypto.getRandomValues(buf)
  return buf[0].toString()
}

// 刻度间距候选（方块数），取屏幕上 >= 80px 的最小档
const TICK_STEPS = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072]

const fmtClimate = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`

export default function SeedsPage() {
  const [seedInput, setSeedInput] = useState('')
  const [version, setVersion] = useState('1.21.4')
  const [dimension, setDimension] = useState('overworld')
  const [center, setCenter] = useState({ x: 0, z: 0 }) // 视野中心（方块坐标）
  const [bpp, setBpp] = useState(16) // 每屏幕像素对应的方块数（最小 4 = quart 无损）
  const [hover, setHover] = useState(null) // { x, z } 方块坐标
  const [copied, setCopied] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [features, setFeatures] = useState({ village: true }) // 结构开关

  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const cacheRef = useRef(null) // { canvas, cx, cz, bpp, w, h }
  const timerRef = useRef(null)
  const renderTokenRef = useRef(0)
  const hoverRafRef = useRef(0)
  const markerImgRef = useRef({})

  // 预加载原版标记纹理（Canvas 绘制用）
  useEffect(() => {
    for (const [key, url] of Object.entries(TEX)) {
      const img = new Image()
      img.src = url
      img.onload = () => draw()
      markerImgRef.current[key] = img
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seedNum = useMemo(() => parseSeed(seedInput), [seedInput])
  const seedReady = seedNum !== null
  const isTextSeed = seedInput.trim() !== '' && !/^[+-]?\d+$/.test(seedInput.trim())
  const biomeSupported = is118plus(version) && dimension === 'overworld'

  // 气候采样器（种子/版本变化时重建；decodeTable 有缓存，开销可控）
  const climate = useMemo(
    () => (seedReady && biomeSupported ? createClimate(seedNum, version) : null),
    [seedNum, seedReady, biomeSupported, version]
  )

  // ---------- 群系层分片渲染（离屏 canvas 缓存） ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const styles = getComputedStyle(canvas)
    ctx.fillStyle = styles.getPropertyValue('--log-bg').trim() || '#0a0e14'
    ctx.fillRect(0, 0, w, h)

    const x0 = center.x - (w / 2) * bpp
    const z0 = center.z - (h / 2) * bpp

    // 群系缓存 blit（平移中时按偏移贴旧图占位）
    const cache = cacheRef.current
    if (cache && cache.bpp === bpp) {
      ctx.imageSmoothingEnabled = cache.bpp > 8
      ctx.drawImage(cache.canvas, (cache.cx - center.x) / bpp, (cache.cz - center.z) / bpp)
    }

    // 史莱姆区块叠加层
    if (features.slime && seedReady && bpp <= 64) {
      const chunkPx = 16 / bpp
      ctx.fillStyle = 'rgba(74, 222, 128, 0.4)'
      const c0x = Math.floor(x0 / 16), c0z = Math.floor(z0 / 16)
      const c1x = Math.floor((x0 + w * bpp) / 16), c1z = Math.floor((z0 + h * bpp) / 16)
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
          if (isSlimeChunk(seedNum, cx, cz)) {
            ctx.fillRect((cx * 16 - x0) / bpp, (cz * 16 - z0) / bpp, Math.max(chunkPx - 0.5, 1), Math.max(chunkPx - 0.5, 1))
          }
        }
      }
    }

    // 结构标记（Minecraft 原版像素纹理）
    if (climate) {
      const iconSize = bpp <= 64 ? 18 : 14
      for (const [key, cfg] of Object.entries(STRUCTURE_TYPES)) {
        if (!features[key]) continue
        const list = findStructures(climate, key, x0, z0, x0 + w * bpp, z0 + h * bpp)
        for (const s of list) {
          const px = (s.x - x0) / bpp
          const py = (s.z - z0) / bpp
          // 深色圆形底衬，保证浅色纹理在任何群系上都清晰
          ctx.beginPath()
          ctx.arc(px, py, iconSize / 2 + 1.5, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(10, 14, 20, 0.62)'
          ctx.fill()
          const img = markerImgRef.current[key]
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(img, px - iconSize / 2, py - iconSize / 2, iconSize, iconSize)
          }
        }
      }
    }

    // 坐标刻度线 + 标签
    let step = TICK_STEPS[TICK_STEPS.length - 1]
    for (const s of TICK_STEPS) { if (s / bpp >= 80) { step = s; break } }
    ctx.strokeStyle = 'rgba(128, 140, 160, 0.14)'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(139, 152, 169, 0.85)'
    ctx.font = '10px sans-serif'
    const gx0 = Math.ceil(x0 / step) * step
    const gz0 = Math.ceil(z0 / step) * step
    ctx.textAlign = 'center'
    for (let gx = gx0; gx <= x0 + w * bpp; gx += step) {
      const px = (gx - x0) / bpp
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke()
      ctx.fillText(String(gx), px, 10)
    }
    ctx.textAlign = 'left'
    for (let gz = gz0; gz <= z0 + h * bpp; gz += step) {
      const py = (gz - z0) / bpp
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
      ctx.fillText(String(gz), 4, py - 4)
    }

    // 原点坐标轴（x=0 / z=0，红色）
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)'
    ctx.lineWidth = 1.5
    const axisX = (0 - x0) / bpp
    const axisZ = (0 - z0) / bpp
    if (axisX >= 0 && axisX <= w) { ctx.beginPath(); ctx.moveTo(axisX, 0); ctx.lineTo(axisX, h); ctx.stroke() }
    if (axisZ >= 0 && axisZ <= h) { ctx.beginPath(); ctx.moveTo(0, axisZ); ctx.lineTo(w, axisZ); ctx.stroke() }

    // 视野中心十字
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w / 2 - 9, h / 2); ctx.lineTo(w / 2 + 9, h / 2)
    ctx.moveTo(w / 2, h / 2 - 9); ctx.lineTo(w / 2, h / 2 + 9)
    ctx.stroke()
  }, [center, bpp, climate, features, seedNum, seedReady])

  // 全量重绘群系层（分片 + 150ms 防抖）
  const scheduleRender = useCallback(() => {
    if (!climate) { cacheRef.current = null; draw(); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) return
      const pxSize = Math.max(1, Math.floor(bpp / 4)) // 1 sample / quart，缩放欠采样
      const rw = Math.ceil(w / pxSize)
      const rh = Math.ceil(h / pxSize)
      const x0 = center.x - (w / 2) * bpp
      const z0 = center.z - (h / 2) * bpp
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d')
      const img = octx.createImageData(rw, rh)
      const data = img.data
      const token = ++renderTokenRef.current
      setRendering(true)
      let j = 0
      const stepRows = 24
      const stepFn = () => {
        if (renderTokenRef.current !== token) return // 已被更新的渲染取代
        const jEnd = Math.min(rh, j + stepRows)
        for (; j < jEnd; j++) {
          const bz = z0 + (j * pxSize + pxSize / 2) * bpp
          for (let i = 0; i < rw; i++) {
            const bx = x0 + (i * pxSize + pxSize / 2) * bpp
            const rgb = BIOME_RGB[getBiomeIdAt(climate, bx, bz)] || FALLBACK_RGB
            const o = (j * rw + i) * 4
            data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255
          }
        }
        if (j < rh) { setTimeout(stepFn, 0); return }
        // 低分辨率 ImageData 放大到离屏画布
        const tmp = document.createElement('canvas')
        tmp.width = rw; tmp.height = rh
        tmp.getContext('2d').putImageData(img, 0, 0)
        octx.imageSmoothingEnabled = pxSize > 1
        octx.drawImage(tmp, 0, 0, w, h)
        cacheRef.current = { canvas: off, cx: center.x, cz: center.z, bpp, w, h }
        setRendering(false)
        draw()
      }
      stepFn()
    }, 150)
  }, [climate, center, bpp, draw])

  useEffect(() => { scheduleRender() }, [scheduleRender])
  useEffect(() => {
    const onResize = () => scheduleRender()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [scheduleRender])
  // 结构/史莱姆开关变化只需重贴覆盖层
  useEffect(() => { draw() }, [features, draw])

  // ---------- 交互：拖拽平移 / 滚轮缩放 / 悬停 ----------
  const toBlock = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.floor(center.x + (e.clientX - rect.left - rect.width / 2) * bpp),
      z: Math.floor(center.z + (e.clientY - rect.top - rect.height / 2) * bpp),
    }
  }

  const onMouseDown = (e) => {
    dragRef.current = { sx: e.clientX, sz: e.clientY, cx: center.x, cz: center.z, moved: false }
  }
  const onMouseMove = (e) => {
    if (dragRef.current) {
      const d = dragRef.current
      d.moved = true
      setCenter({ x: d.cx - (e.clientX - d.sx) * bpp, z: d.cz - (e.clientY - d.sz) * bpp })
    } else {
      if (hoverRafRef.current) return
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = 0
        setHover(toBlock(e))
      })
    }
  }
  const onMouseUp = () => { dragRef.current = null }
  const onWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 0.7 : 1.4
    setBpp((b) => Math.min(1024, Math.max(4, Math.round(b * factor * 100) / 100)))
  }

  const copySeed = async () => {
    if (!seedReady) return
    try {
      await navigator.clipboard.writeText(seedNum.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const openChunkbase = () => {
    const s = seedReady ? seedNum.toString() : '0'
    window.nal.updater.openUrl(`https://www.chunkbase.com/apps/seed-map#seed=${s}`)
  }

  // 悬停点完整群系信息（含气候值）
  const hoverInfo = useMemo(() => {
    if (!hover || !climate) return null
    return getBiomeAt(climate, hover.x, hover.z)
  }, [hover, climate])

  const toggleFeature = (key) => setFeatures((f) => ({ ...f, [key]: !f[key] }))

  return (
    <div className="scroll-y" style={{ height: '100%', padding: '32px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 className="text-2xl mb-4">种子查看器</h1>

        {/* 顶部卡片：Seed / Version / Dimension 三行 */}
        <div className="card mb-4">
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 14, columnGap: 16, alignItems: 'center' }}>
            <label className="field-label" style={{ margin: 0 }}>Seed</label>
            <div className="flex gap-2 items-center">
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="例如 -4530634556500121041 或 hello"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
              />
              <button className="btn btn-ghost" onClick={() => setSeedInput(randomSeed())} title="随机生成种子">
                <Icon name="refresh" size={15} /> 随机
              </button>
              {seedReady && (
                <button className="btn btn-ghost" onClick={copySeed} title={seedNum.toString()}>
                  <Icon name={copied ? 'check' : 'clipboard'} size={15} /> {copied ? '已复制' : '复制'}
                </button>
              )}
            </div>
            {seedInput.trim() !== '' && (
              <>
                <span />
                <div className="text-xs" style={{ color: 'var(--text-secondary)', marginTop: -8 }}>
                  数值种子：<strong style={{ color: 'var(--accent)' }}>{seedNum?.toString()}</strong>
                  {isTextSeed && <span className="text-tertiary">（文本种子经 Java hashCode 转换，与游戏内行为一致）</span>}
                </div>
              </>
            )}
            <label className="field-label" style={{ margin: 0 }}>Version</label>
            <select className="select" value={version} onChange={(e) => setVersion(e.target.value)}>
              {MC_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <label className="field-label" style={{ margin: 0 }}>Dimension</label>
            <select className="select" value={dimension} onChange={(e) => setDimension(e.target.value)}>
              {DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {/* Features 结构开关 chips */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-xs text-tertiary" style={{ marginRight: 4 }}>Features</span>
          {Object.entries(STRUCTURE_TYPES).map(([key, cfg]) => (
            <button
              key={key}
              className="btn btn-sm"
              disabled={!biomeSupported}
              onClick={() => toggleFeature(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                ...(features[key] && biomeSupported
                  ? { background: 'var(--accent)', color: '#fff', border: 'none' }
                  : { background: 'transparent', border: '1px solid var(--border, rgba(128,140,160,0.3))', color: 'var(--text-secondary)' }),
              }}
            >
              <img src={TEX[key]} alt="" style={{ width: 16, height: 16, imageRendering: 'pixelated' }} />
              {cfg.name}
            </button>
          ))}
          <button
            className="btn btn-sm"
            disabled={!seedReady || !biomeSupported}
            onClick={() => toggleFeature('slime')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              ...(features.slime && biomeSupported
                ? { background: 'rgba(74, 222, 128, 0.85)', color: '#062b16', border: 'none' }
                : { background: 'transparent', border: '1px solid var(--border, rgba(128,140,160,0.3))', color: 'var(--text-secondary)' }),
            }}
          >
            <img src={texSlime} alt="" style={{ width: 16, height: 16, imageRendering: 'pixelated' }} />
            史莱姆区块
          </button>
        </div>

        {/* 群系地图 */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg" style={{ fontWeight: 600 }}>群系地图</h2>
            <div className="flex gap-2 items-center">
              {rendering && <span className="text-xs" style={{ color: 'var(--accent)' }}>渲染中…</span>}
              <span className="text-xs text-tertiary">拖拽平移 · 滚轮缩放 · 红线为坐标原点</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setCenter({ x: 0, z: 0 }); setBpp(16) }}>回到原点</button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 480, borderRadius: 'var(--radius)', cursor: 'grab', display: 'block' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { onMouseUp(); setHover(null) }}
              onWheel={onWheel}
            />
            {(!seedReady || !biomeSupported) && (
              <div
                className="text-secondary text-sm"
                style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8,
                  alignItems: 'center', justifyContent: 'center', background: 'var(--log-bg)',
                  borderRadius: 'var(--radius)', textAlign: 'center', padding: '0 32px',
                }}
              >
                {!seedReady
                  ? '输入种子后这里会显示以原点为中心的群系地图'
                  : dimension !== 'overworld'
                    ? '下界 / 末地的群系生成算法与主世界不同，暂未本地实现——可点击下方按钮跳转 Chunkbase 查看'
                    : `群系地图仅支持 1.18+（当前 ${version}）；史莱姆区块分布全版本一致，可跳转 Chunkbase 按版本查看`}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              中心 ({Math.round(center.x)}, {Math.round(center.z)}) · 1 px = {bpp} 方块
            </div>
            {hover && biomeSupported && (
              <div className="text-xs" style={{ color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>({hover.x}, {hover.z})</span>
                {hoverInfo && (
                  <>
                    <span style={{ color: hoverInfo.color, fontWeight: 600 }}>{hoverInfo.name}</span>
                    <span className="text-tertiary">
                      T {fmtClimate(hoverInfo.climate.t)} · H {fmtClimate(hoverInfo.climate.h)} · C {fmtClimate(hoverInfo.climate.c)} · E {fmtClimate(hoverInfo.climate.e)} · W {fmtClimate(hoverInfo.climate.w)}
                    </span>
                  </>
                )}
                {seedReady && isSlimeChunk(seedNum, Math.floor(hover.x / 16), Math.floor(hover.z / 16)) && (
                  <span style={{ color: 'rgb(74, 222, 128)' }}>史莱姆区块</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 完整地图（要塞、古城等未本地实现的结构交给 Chunkbase） */}
        <div className="card">
          <h2 className="text-lg mb-2" style={{ fontWeight: 600 }}>更多结构</h2>
          <p className="text-sm text-secondary mb-4" style={{ lineHeight: 1.7 }}>
            要塞、古城、试炼密室等结构的定位规则与上面 8 种不同，暂未本地实现；
            需要时可前往 Chunkbase 查看——会自动填入当前种子，版本选择 <strong>{version}</strong> 即可。
          </p>
          <button className="btn btn-primary" onClick={openChunkbase} disabled={!seedReady}>
            <Icon name="globe" size={15} /> 在 Chunkbase 查看完整地图
          </button>
          <p className="text-xs text-tertiary mt-3" style={{ margin: 0, marginTop: 12 }}>
            地图上的结构图标使用 Minecraft 1.21.4 原版物品/方块纹理（© Mojang Studios），仅用于本启动器内展示。
          </p>
        </div>
      </div>
    </div>
  )
}
