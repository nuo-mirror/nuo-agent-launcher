// 模组服务：Modrinth API（无需 API 密钥）搜索、版本查询、依赖解析、下载安装
// 同时提供 Fabric 版本安装（Fabric Meta API）
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { logger } = require('./logger.cjs')
const { request } = require('./account.cjs')
const { downloadFile, httpGet, installVersion } = require('./downloader.cjs')

const VERSIONS_DIR = process.env.NAL_VERSIONS_DIR
const LIBRARIES_DIR = process.env.NAL_LIBRARIES_DIR
const CACHE_DIR = process.env.NAL_CACHE_DIR
const MODRINTH_API = 'https://api.modrinth.com/v2'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'

let _mainWindowGetter = null

// ============ 检测实例的加载器和游戏版本 ============
function detectInstanceInfo(instanceId) {
  const jsonPath = path.join(VERSIONS_DIR, instanceId, `${instanceId}.json`)
  if (!fs.existsSync(jsonPath)) throw new Error(`实例 ${instanceId} 不存在`)
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const mainClass = (json.mainClass || '').toLowerCase()
  const idLower = String(instanceId).toLowerCase()
  let loader = 'vanilla'
  if (mainClass.includes('fabric') || mainClass.includes('knot') || idLower.startsWith('fabric-')) loader = 'fabric'
  else if (mainClass.includes('neoforge') || idLower.includes('neoforge')) loader = 'neoforge'
  else if (mainClass.includes('quilt') || idLower.startsWith('quilt-loader-')) loader = 'quilt'
  else if (mainClass.includes('forge') || mainClass.includes('fml') || mainClass.includes('bootstraplauncher') || idLower.includes('forge')) loader = 'forge'
  else if (mainClass.includes('optifine')) loader = 'optifine'
  const gameVersion = json.inheritsFrom || instanceId
  return { loader, gameVersion }
}

// ============ Modrinth 搜索 ============
async function searchMods({ query = '', loader = '', gameVersion = '', limit = 20, offset = 0, index = 'downloads', type = 'mod' } = {}) {
  const facets = [[`project_type:${type}`]]
  // 资源包/光影不按 loader 过滤
  if (loader && type === 'mod') facets.push([`categories:${loader}`])
  if (gameVersion) facets.push([`versions:${gameVersion}`])
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    index,
    query,
    facets: JSON.stringify(facets),
  })
  const url = `${MODRINTH_API}/search?${params.toString()}`
  const res = await request(url, { headers: { Accept: 'application/json' } })
  if (res.statusCode !== 200) throw new Error(`Modrinth 搜索失败 (HTTP ${res.statusCode})`)
  const data = JSON.parse(res.text)
  return {
    total: data.total_hits,
    hits: (data.hits || []).map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      follows: h.follows,
      iconUrl: h.icon_url || '',
      categories: h.categories || [],
      clientSide: h.client_side,
      serverSide: h.server_side,
      dateModified: h.date_modified,
    })),
  }
}

// ============ 查询模组兼容版本 ============
async function getModVersions(projectId, loader, gameVersion) {
  const params = new URLSearchParams()
  if (loader) params.set('loaders', JSON.stringify([loader]))
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
  const url = `${MODRINTH_API}/project/${projectId}/version?${params.toString()}`
  const res = await request(url, { headers: { Accept: 'application/json' } })
  if (res.statusCode !== 200) throw new Error(`获取模组版本失败 (HTTP ${res.statusCode})`)
  const list = JSON.parse(res.text)
  return list.map((v) => ({
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    changelog: v.changelog ? String(v.changelog).slice(0, 800) : '',
    loaders: v.loaders || [],
    gameVersions: v.game_versions || [],
    datePublished: v.date_published,
    downloads: v.downloads,
    dependencies: (v.dependencies || []).map((d) => ({
      projectId: d.project_id,
      type: d.dependency_type, // required / optional / embedded
    })),
    file: (v.files || []).find((f) => f.primary) || (v.files || [])[0] || null,
  }))
}

// ============ 安装模组（含必需依赖递归下载） ============
async function installMod({ projectId, instanceId, versionId = null }) {
  const info = detectInstanceInfo(instanceId)
  if (info.loader === 'vanilla') {
    throw new Error('原版实例不支持模组，请先安装 Fabric（推荐）或 Forge')
  }
  const modsDir = path.join(VERSIONS_DIR, instanceId, 'mods')
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

  const installed = []
  const failed = []
  const visited = new Set()

  async function downloadVersion(pid, depth) {
    if (visited.has(pid) || depth > 5) return
    visited.add(pid)
    const versions = await getModVersions(pid, info.loader, info.gameVersion)
    let target = versionId ? versions.find((v) => v.id === versionId) : versions[0]
    if (!target || !target.file) {
      failed.push({ projectId: pid, reason: '没有兼容此版本/加载器的文件' })
      return
    }
    const fileUrl = target.file.url
    const fileName = target.file.filename
    const dest = path.join(modsDir, fileName)
    if (fs.existsSync(dest)) {
      installed.push({ projectId: pid, fileName, skipped: true })
    } else {
      pushProgress({ phase: `下载 ${fileName}`, current: installed.length + 1, file: fileName })
      await downloadFile(fileUrl, dest, { timeout: 120000 })
      installed.push({ projectId: pid, fileName, skipped: false })
      logger.info('download', `模组下载完成: ${fileName}`)
    }
    // 记录 Modrinth 来源元数据（供更新检查/管理用）
    try {
      const metaPath = path.join(modsDir, '.nuo-mods.json')
      let meta = {}
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { }
      meta[fileName] = { modrinthProjectId: pid, versionNumber: target.version_number, name: pid }
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    } catch { }
    // 递归下载必需依赖
    for (const dep of target.dependencies || []) {
      if (dep.type === 'required' && dep.projectId) {
        await downloadVersion(dep.projectId, depth + 1)
      }
    }
  }

  try {
    await downloadVersion(projectId, 0)
  } catch (e) {
    logger.error('download', '模组安装失败', { error: e.message })
    return { success: false, error: e.message, installed, failed }
  }
  return { success: failed.length === 0, installed, failed, modsDir }
}

function listInstalledMods(instanceId) {
  const modsDir = path.join(VERSIONS_DIR, instanceId, 'mods')
  if (!fs.existsSync(modsDir)) return []
  let meta = {}
  try { meta = JSON.parse(fs.readFileSync(path.join(modsDir, '.nuo-mods.json'), 'utf8')) } catch { }
  return fs.readdirSync(modsDir)
    .filter((f) => /\.jar(\.disabled)?$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(modsDir, f))
      const disabled = f.endsWith('.disabled')
      const baseName = disabled ? f.slice(0, -'.disabled'.length) : f
      const m = meta[baseName] || {}
      return {
        filename: f,
        enabled: !disabled,
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
        modrinthProjectId: m.modrinthProjectId || null,
        versionNumber: m.versionNumber || null,
        name: m.name || baseName,
      }
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

// 启用 / 禁用模组（重命名 .jar <-> .jar.disabled）
function setModEnabled(instanceId, filename, enabled) {
  const modsDir = path.join(VERSIONS_DIR, instanceId, 'mods')
  const src = path.join(modsDir, filename)
  if (!fs.existsSync(src)) return { success: false, error: '文件不存在' }
  const target = enabled ? filename.replace(/\.disabled$/i, '') : filename + '.disabled'
  if (target === filename) return { success: true, filename }
  const dest = path.join(modsDir, target)
  fs.renameSync(src, dest)
  logger.info('mod', `${enabled ? '启用' : '禁用'}模组 ${target}`, { instanceId })
  return { success: true, filename: target, enabled }
}

function deleteMod(instanceId, filename) {
  const file = path.join(VERSIONS_DIR, instanceId, 'mods', filename)
  if (fs.existsSync(file)) {
    fs.unlinkSync(file)
    // 同步清理元数据
    try {
      const modsDir = path.join(VERSIONS_DIR, instanceId, 'mods')
      const metaPath = path.join(modsDir, '.nuo-mods.json')
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      const base = filename.replace(/\.disabled$/i, '')
      if (meta[base]) { delete meta[base]; fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8') }
    } catch { }
    return true
  }
  return false
}

// ============ Fabric 版本安装 ============
async function installFabric(gameVersion, loaderVersion) {
  const taskId = `fabric-${gameVersion}-${loaderVersion}-${Date.now()}`
  const instanceId = `fabric-${loaderVersion}-${gameVersion}`
  const versionDir = path.join(VERSIONS_DIR, instanceId)
  const log = (msg, extra) => pushLog(msg, extra)
  const progress = (phase, percent) => pushProgress(taskId, { phase, percent })

  try {
    // 1. 确保原版已安装
    const vanillaJson = path.join(VERSIONS_DIR, gameVersion, `${gameVersion}.json`)
    if (!fs.existsSync(vanillaJson)) {
      log(`原版 ${gameVersion} 未安装，先安装原版...`)
      progress('安装原版依赖', 2)
      const r = await installVersion(gameVersion)
      if (!r.success) throw new Error(`原版 ${gameVersion} 安装失败: ${r.error}`)
    }
    progress('获取 Fabric Profile', 15)
    log(`获取 Fabric ${loaderVersion} for ${gameVersion}`)

    // 2. 拉取 Fabric profile json
    const profileUrl = `${FABRIC_META}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`
    const res = await request(profileUrl, { headers: { Accept: 'application/json' } })
    if (res.statusCode !== 200) throw new Error(`Fabric Meta 请求失败 (HTTP ${res.statusCode})`)
    const profile = JSON.parse(res.text)
    // profile: { id, inheritsFrom, releaseTime, mainClass, libraries: [{name, url}] }
    if (!profile.inheritsFrom) profile.inheritsFrom = gameVersion
    if (!profile.id) profile.id = instanceId

    // 3. 写版本 json
    if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf8')
    progress('下载 Fabric 库', 30)

    // 4. 下载 libraries（fabric 库带 url 字段，指向 maven.fabricmc.net）
    const { LIBRARIES_DIR } = {
      LIBRARIES_DIR: process.env.NAL_LIBRARIES_DIR,
    }
    const libs = profile.libraries || []
    let done = 0
    for (const lib of libs) {
      if (!lib.name) { done++; continue }
      const parts = lib.name.split(':')
      if (parts.length !== 3) { done++; continue }
      const [group, artifact, version] = parts
      const relPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
      const localPath = path.join(LIBRARIES_DIR, relPath)
      if (!fs.existsSync(localPath)) {
        const base = (lib.url || 'https://maven.fabricmc.net/').replace(/\/?$/, '/')
        const url = base + relPath
        try {
          await downloadFile(url, localPath, { timeout: 60000 })
        } catch (e) {
          log(`库下载失败 ${lib.name}: ${e.message}`, { error: true })
        }
      }
      done++
      progress(`下载 Fabric 库 ${done}/${libs.length}`, 30 + (done / libs.length) * 40)
    }
    log(`Fabric 库下载完成 (${libs.length} 个)`)

    // 5. 拷贝/复用原版 jar（fabric profile 无自己的 jar，启动时用 inheritsFrom 的 jar）
    progress('完成', 100)
    log(`Fabric 实例 ${profile.id} 安装完成，可在主页选择它并安装模组`)
    return { success: true, instanceId: profile.id }
  } catch (e) {
    logger.error('download', 'Fabric 安装失败', { error: e.message })
    pushLog(`Fabric 安装失败: ${e.message}`, { error: true })
    pushProgress(taskId, { phase: '安装失败', percent: 100, error: e.message })
    return { success: false, error: e.message }
  }
}

function pushProgress(taskId, data) {
  if (typeof data !== 'object' || data === null) data = { phase: taskId, percent: data }
  if (taskId && typeof taskId === 'string') data.taskId = taskId
  if (_mainWindowGetter && _mainWindowGetter()) {
    try { _mainWindowGetter().webContents.send('mods:progress', data) } catch {}
  }
}
function pushLog(msg, extra) {
  if (_mainWindowGetter && _mainWindowGetter()) {
    try { _mainWindowGetter().webContents.send('download:log', { message: msg, extra, timestamp: Date.now() }) } catch {}
  }
  logger.info('download', msg, extra)
}

// ============ 安装 Quilt 加载器 ============
async function installQuilt(gameVersion, loaderVersion) {
  const taskId = `quilt-${gameVersion}-${loaderVersion}-${Date.now()}`
  const instanceId = `quilt-loader-${loaderVersion}-${gameVersion}`
  const versionDir = path.join(VERSIONS_DIR, instanceId)
  const log = (msg, extra) => pushLog(msg, extra)
  const progress = (phase, percent) => pushProgress(taskId, { phase, percent })
  try {
    log(`开始安装 Quilt: MC ${gameVersion} + Loader ${loaderVersion}`)
    const vanillaJson = path.join(VERSIONS_DIR, gameVersion, `${gameVersion}.json`)
    if (!fs.existsSync(vanillaJson)) {
      log(`原版 ${gameVersion} 未安装，先安装原版...`)
      progress('安装原版依赖', 2)
      const result = await installVersion(gameVersion)
      if (!result.success) throw new Error(`原版 ${gameVersion} 安装失败: ${result.error}`)
    }
    progress('获取 Quilt Profile', 15)
    const profileUrl = `${QUILT_META}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`
    const res = await httpGet(profileUrl)
    const profile = JSON.parse(res.data.toString())
    if (!profile.inheritsFrom) profile.inheritsFrom = gameVersion
    if (!profile.id) profile.id = instanceId
    if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf8')
    progress('下载 Quilt 库', 30)
    const libs = profile.libraries || []
    let done = 0
    for (const lib of libs) {
      if (!lib.name) { done++; continue }
      const parts = lib.name.split(':')
      if (parts.length !== 3) { done++; continue }
      const [group, artifact, version] = parts
      const relPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
      const localPath = path.join(LIBRARIES_DIR, relPath)
      if (!fs.existsSync(localPath)) {
        const base = (lib.url || 'https://maven.quiltmc.org/repository/release/').replace(/\/?$/, '/')
        try { await downloadFile(base + relPath, localPath, { timeout: 60000 }) }
        catch (e) { log(`库下载失败 ${lib.name}: ${e.message}`, { error: true }) }
      }
      done++
      progress(`下载 Quilt 库 ${done}/${libs.length}`, 30 + (done / libs.length) * 40)
    }
    progress('完成', 100)
    log(`Quilt 实例 ${profile.id} 安装完成`)
    return { success: true, instanceId: profile.id }
  } catch (e) {
    logger.error('download', 'Quilt 安装失败', { error: e.message })
    pushLog(`Quilt 安装失败: ${e.message}`, { error: true })
    pushProgress(taskId, { phase: '安装失败', percent: 100, error: e.message })
    return { success: false, error: e.message }
  }
}

// ============ 安装 NeoForge 加载器（运行官方安装器） ============
function runNeoForgeInstaller(javaExe, installerPath, workDir, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(javaExe, ['-jar', installerPath, '--installClient', workDir], { cwd: workDir, windowsHide: true })
    const errTail = []
    child.stdout.on('data', (d) => { const t = d.toString().trim(); if (t) log(t) })
    child.stderr.on('data', (d) => { const t = d.toString().trim(); if (t) { errTail.push(t); log(t, { error: true }) } })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`安装器退出码 ${code}${errTail.length ? ': ' + errTail.slice(-5).join(' | ') : ''}`))))
  })
}

function copyDirMerge(src, dest) {
  let count = 0
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) count += copyDirMerge(s, d)
    else { fs.copyFileSync(s, d); count++ }
  }
  return count
}

async function installNeoForge(gameVersion, neoforgeVersion) {
  const taskId = `neoforge-${gameVersion}-${neoforgeVersion}-${Date.now()}`
  const log = (msg, extra) => pushLog(msg, extra)
  const progress = (phase, percent) => pushProgress(taskId, { phase, percent })
  const staging = path.join(CACHE_DIR, `neoforge-install-${Date.now()}`)
  try {
    log(`开始安装 NeoForge: MC ${gameVersion} + NeoForge ${neoforgeVersion}`)
    const vanillaJson = path.join(VERSIONS_DIR, gameVersion, `${gameVersion}.json`)
    if (!fs.existsSync(vanillaJson)) {
      progress('安装原版依赖', 2)
      log(`原版 ${gameVersion} 未安装，先安装...`)
      const result = await installVersion(gameVersion)
      if (!result.success) throw new Error(`原版 ${gameVersion} 安装失败: ${result.error}`)
    }
    progress('准备 Java 运行安装器', 8)
    const { ensureJavaForVersion } = require('./java.cjs')
    const javaRes = await ensureJavaForVersion(gameVersion)
    const javaExe = javaRes.exePath
    progress('下载 NeoForge 安装器', 12)
    fs.mkdirSync(staging, { recursive: true })
    const installerPath = path.join(staging, 'neoforge-installer.jar')
    const candidates = [
      `https://bmclapi2.bangbang93.com/maven/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`,
      `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`,
    ]
    let got = false; let lastErr = null
    for (const url of candidates) {
      try { log(`下载安装器: ${url}`); await downloadFile(url, installerPath, { timeout: 180000 }); got = true; break }
      catch (e) { lastErr = e }
    }
    if (!got) throw new Error(`NeoForge 安装器下载失败: ${lastErr && lastErr.message}`)
    progress('运行 NeoForge 安装器（可能需要几分钟）', 20)
    await runNeoForgeInstaller(javaExe, installerPath, staging, log)
    const versionsSub = path.join(staging, 'versions')
    if (!fs.existsSync(versionsSub)) throw new Error('安装器未生成 versions 目录')
    const produced = fs.readdirSync(versionsSub).find((d) => fs.existsSync(path.join(versionsSub, d, `${d}.json`)))
    if (!produced) throw new Error('未找到安装器生成的版本 JSON')
    const targetDir = path.join(VERSIONS_DIR, produced)
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(path.join(versionsSub, produced, `${produced}.json`), path.join(targetDir, `${produced}.json`))
    progress('合并依赖库', 85)
    const stagingLibs = path.join(staging, 'libraries')
    let copied = 0
    if (fs.existsSync(stagingLibs)) copied = copyDirMerge(stagingLibs, LIBRARIES_DIR)
    progress('完成', 100)
    log(`NeoForge 实例 ${produced} 安装完成（合并 ${copied} 个库文件）`)
    return { success: true, instanceId: produced }
  } catch (e) {
    logger.error('download', 'NeoForge 安装失败', { error: e.message })
    pushLog(`NeoForge 安装失败: ${e.message}`, { error: true })
    pushProgress(taskId, { phase: '安装失败', percent: 100, error: e.message })
    return { success: false, error: e.message }
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch { }
  }
}

function register(ipcMain, getMainWindow) {
  _mainWindowGetter = getMainWindow
  ipcMain.handle('mods:search', (_e, opts) => searchMods(opts || {}))
  ipcMain.handle('mods:versions', (_e, pid, loader, gv) => getModVersions(pid, loader, gv))
  ipcMain.handle('mods:install', (_e, opts) => installMod(opts || {}))
  ipcMain.handle('mods:list-installed', (_e, id) => listInstalledMods(id))
  ipcMain.handle('mods:delete', (_e, id, f) => deleteMod(id, f))
  ipcMain.handle('mods:set-enabled', (_e, id, f, en) => setModEnabled(id, f, en))
  ipcMain.handle('download:install-fabric', (_e, gv, lv) => installFabric(gv, lv))
  ipcMain.handle('download:install-quilt', (_e, gv, lv) => installQuilt(gv, lv))
  ipcMain.handle('download:install-neoforge', (_e, gv, nv) => installNeoForge(gv, nv))
}

module.exports = { register, searchMods, getModVersions, installMod, installFabric, installQuilt, installNeoForge, listInstalledMods, deleteMod, setModEnabled, detectInstanceInfo }
