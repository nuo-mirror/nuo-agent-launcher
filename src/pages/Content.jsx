// 资源管理页：资源包、光影、存档、截图、整合包导入导出、模组更新
import { useEffect, useState, useCallback } from 'react'
import Icon from '../components/Icon.jsx'

const TABS = [
  { key: 'resourcepacks', label: '资源包', sub: 'resourcepacks' },
  { key: 'shaderpacks', label: '光影', sub: 'shaderpacks' },
  { key: 'saves', label: '存档', sub: 'saves' },
  { key: 'screenshots', label: '截图', sub: 'screenshots' },
  { key: 'modpack', label: '整合包', sub: null },
]

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}
function fmtTime(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleString()
}

export default function ContentPage() {
  const [instances, setInstances] = useState([])
  const [instanceId, setInstanceId] = useState('')
  const [tab, setTab] = useState('resourcepacks')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const list = await window.nal.download.listInstalled()
        setInstances(list)
        if (list.length && !instanceId) setInstanceId(list[0].id)
      } catch (e) { setError(e.message) }
    })()
  }, [])

  if (!instances.length) {
    return (
      <div className="scroll-y" style={{ height: '100%', padding: 32 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h1 className="text-2xl mb-4">资源管理</h1>
          <div className="card text-secondary text-sm">尚未安装任何游戏版本，请先到「下载中心」安装。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="scroll-y" style={{ height: '100%', padding: 32 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 className="text-2xl mb-4">资源管理</h1>

        {/* 实例选择 */}
        <div className="card mb-4">
          <label className="field-label">选择游戏实例</label>
          <select className="select" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
            {instances.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </div>

        {/* 分类标签 */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="card mb-4" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.08)' }}>
            <div className="text-sm" style={{ color: 'var(--error)', display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="alert" size={15} />{error}</div>
          </div>
        )}

        {instanceId && tab === 'resourcepacks' && <PackTab key={instanceId + 'rp'} instanceId={instanceId} sub="resourcepacks" type="resourcepack" setError={setError} />}
        {instanceId && tab === 'shaderpacks' && <PackTab key={instanceId + 'sp'} instanceId={instanceId} sub="shaderpacks" type="shader" setError={setError} />}
        {instanceId && tab === 'saves' && <SavesTab key={instanceId + 'sv'} instanceId={instanceId} setError={setError} />}
        {instanceId && tab === 'screenshots' && <ShotsTab key={instanceId + 'sc'} instanceId={instanceId} setError={setError} />}
        {instanceId && tab === 'modpack' && <ModpackTab key={instanceId + 'mp'} instanceId={instanceId} setError={setError} />}
      </div>
      <style>{`.field-label{display:block;margin-bottom:6px;font-size:13px;color:var(--text-secondary);font-weight:500}`}</style>
    </div>
  )
}

// ============ 资源包 / 光影 通用标签页 ============
function PackTab({ instanceId, sub, type, setError }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = sub === 'resourcepacks' ? await window.nal.content.listResourcePacks(instanceId) : await window.nal.content.listShaderPacks(instanceId)
      setItems(list)
    } catch (e) { setError(e.message) }
  }, [instanceId, sub])

  useEffect(() => { refresh() }, [refresh])

  const doDelete = async (name) => {
    if (!confirm(`删除 ${name}？`)) return
    await window.nal.content.deleteFile(instanceId, sub, name)
    refresh()
  }
  const openDir = async () => {
    const dir = await window.nal.content.openDir(instanceId, sub)
    if (dir && window.nal.system?.openPath) window.nal.system.openPath(dir)
  }
  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const r = await window.nal.mods.search({ query, type, limit: 12 })
      setResults(r.hits || [])
    } catch (e) { setError(e.message) } finally { setSearching(false) }
  }
  const install = async (projectId) => {
    setBusy(true)
    try {
      await window.nal.content.installFromModrinth(instanceId, projectId, sub)
      refresh()
    } catch (e) { alert('安装失败：' + e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg" style={{ fontWeight: 600 }}>已安装（{items.length}）</h2>
          <button className="btn btn-ghost btn-sm" onClick={openDir}><Icon name="folder" size={14} /> 打开文件夹</button>
        </div>
        {items.length === 0 ? (
          <div className="text-secondary text-sm">暂无内容</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((it) => (
              <div key={it.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{it.name}</strong>
                  <span className="text-xs text-tertiary" style={{ marginLeft: 8 }}>{fmtSize(it.size)} · {fmtTime(it.mtime)}</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => doDelete(it.name)}>删除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg mb-2" style={{ fontWeight: 600 }}>从 Modrinth 安装</h2>
        <div className="flex gap-2 mb-3">
          <input className="input" style={{ flex: 1 }} placeholder={`搜索${type === 'shader' ? '光影' : '资源包'}...`} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
          <button className="btn btn-primary" onClick={doSearch} disabled={searching}>{searching ? '搜索中...' : '搜索'}</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {results.map((r) => (
            <div key={r.projectId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
              {r.iconUrl && <img src={r.iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{r.title}</strong>
                <div className="text-xs text-tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => install(r.projectId)} disabled={busy}>安装</button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ============ 存档 ============
function SavesTab({ instanceId, setError }) {
  const [items, setItems] = useState([])
  const refresh = useCallback(async () => {
    try { setItems(await window.nal.content.listSaves(instanceId)) } catch (e) { setError(e.message) }
  }, [instanceId])
  useEffect(() => { refresh() }, [refresh])

  const openDir = async () => {
    const dir = await window.nal.content.openDir(instanceId, 'saves')
    if (dir && window.nal.system?.openPath) window.nal.system.openPath(dir)
  }
  const doExport = async (name) => {
    const r = await window.nal.content.exportSave(instanceId, name)
    if (r.success) alert('已导出到：' + r.filePath)
  }
  const doDelete = async (name) => {
    if (!confirm(`删除存档 ${name}？此操作不可恢复！`)) return
    await window.nal.content.deleteFile(instanceId, 'saves', name)
    refresh()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg" style={{ fontWeight: 600 }}>存档（{items.length}）</h2>
        <button className="btn btn-ghost btn-sm" onClick={openDir}><Icon name="folder" size={14} /> 打开文件夹</button>
      </div>
      {items.length === 0 ? (
        <div className="text-secondary text-sm">暂无存档</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)' }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                <span className="text-xs text-tertiary" style={{ marginLeft: 8 }}>{fmtTime(s.mtime)}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => doExport(s.name)}>导出</button>
                <button className="btn btn-ghost btn-sm" onClick={() => doDelete(s.name)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 截图 ============
function ShotsTab({ instanceId, setError }) {
  const [items, setItems] = useState([])
  const [preview, setPreview] = useState(null) // {name, data}
  const refresh = useCallback(async () => {
    try { setItems(await window.nal.content.listScreenshots(instanceId)) } catch (e) { setError(e.message) }
  }, [instanceId])
  useEffect(() => { refresh() }, [refresh])

  const openDir = async () => {
    const dir = await window.nal.content.openDir(instanceId, 'screenshots')
    if (dir && window.nal.system?.openPath) window.nal.system.openPath(dir)
  }
  const doDelete = async (name) => {
    if (!confirm(`删除截图 ${name}？`)) return
    await window.nal.content.deleteFile(instanceId, 'screenshots', name)
    refresh()
  }
  const show = async (name) => {
    const data = await window.nal.content.getScreenshotData(instanceId, name)
    setPreview({ name, data })
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg" style={{ fontWeight: 600 }}>截图（{items.length}）</h2>
        <button className="btn btn-ghost btn-sm" onClick={openDir}><Icon name="folder" size={14} /> 打开文件夹</button>
      </div>
      {items.length === 0 ? (
        <div className="text-secondary text-sm">暂无截图</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
          {items.map((s) => <ShotCard key={s.name} instanceId={instanceId} shot={s} onShow={show} onDelete={doDelete} />)}
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          <img src={preview.data} alt={preview.name} style={{ maxWidth: '92%', maxHeight: '92%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

function ShotCard({ instanceId, shot, onShow, onDelete }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let mounted = true
    window.nal.content.getScreenshotData(instanceId, shot.name).then((d) => { if (mounted) setData(d) }).catch(() => {})
    return () => { mounted = false }
  }, [instanceId, shot.name])
  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ aspectRatio: '16/9', background: 'var(--bg-secondary)', cursor: 'zoom-in' }} onClick={() => onShow(shot.name)}>
        {data && <img src={data} alt={shot.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-xs text-tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.name}</span>
        <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={() => onDelete(shot.name)}>删</button>
      </div>
    </div>
  )
}

// ============ 整合包导入导出 ============
function ModpackTab({ instanceId, setError }) {
  const [busy, setBusy] = useState(false)
  const doImport = async () => {
    setBusy(true)
    try {
      const r = await window.nal.content.importModpack(instanceId)
      if (r.success) alert(`导入完成：${r.name || ''}\n下载 ${r.downloaded} 个文件${r.failed ? `，失败 ${r.failed} 个` : ''}`)
    } catch (e) { alert('导入失败：' + e.message) } finally { setBusy(false) }
  }
  const doExport = async () => {
    setBusy(true)
    try {
      const r = await window.nal.content.exportModpack(instanceId)
      if (r.success) alert('已导出到：' + r.filePath)
    } catch (e) { alert('导出失败：' + e.message) } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <h2 className="text-lg mb-2" style={{ fontWeight: 600 }}>整合包</h2>
      <div className="text-sm text-secondary mb-4">
        把社区整合包（Modrinth .mrpack）导入到当前实例，或把当前实例的模组/资源包/光影/配置打包成 .mrpack 分享给别人。
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={doImport} disabled={busy}><Icon name="download" size={14} /> 导入整合包到此实例</button>
        <button className="btn btn-ghost" onClick={doExport} disabled={busy}><Icon name="save" size={14} /> 导出此实例为整合包</button>
      </div>
      <div className="text-xs text-tertiary mt-3">提示：导入会下载整合包内所有文件并应用覆盖文件，建议先备份。</div>
    </div>
  )
}
