// 实例内容管理服务：资源包、光影、存档、截图、整合包导入导出、模组更新检查
// 实例游戏目录 = VERSIONS_DIR/<instanceId>（启动器已按版本隔离）
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const { logger } = require('./logger.cjs')
const { httpGet, downloadFile } = require('./downloader.cjs')
const { getModVersions, detectInstanceInfo, listInstalledMods } = require('./mod.cjs')

const VERSIONS_DIR = process.env.NAL_VERSIONS_DIR
const MODRINTH_API = 'https://api.modrinth.com/v2'

let _mainWindowGetter = null

function instanceDir(instanceId) {
  const dir = path.join(VERSIONS_DIR, instanceId)
  if (!fs.existsSync(dir)) throw new Error(`实例 ${instanceId} 不存在`)
  return dir
}

function contentDir(instanceId, sub) {
  return path.join(instanceDir(instanceId), sub)
}

function safeList(dir) {
  try { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [] } catch { return [] }
}

// ============ 资源包 ============
function listResourcePacks(instanceId) {
  const dir = contentDir(instanceId, 'resourcepacks')
  return safeList(dir)
    .filter((e) => e.isFile() && /\.(zip|jar)$/i.test(e.name))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name))
      return { name: e.name, size: st.size, mtime: st.mtimeMs, enabled: !e.name.endsWith('.disabled') }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

// ============ 光影包 ============
function listShaderPacks(instanceId) {
  const dir = contentDir(instanceId, 'shaderpacks')
  return safeList(dir)
    .filter((e) => e.isFile() && /\.(zip|tar\.gz)$/i.test(e.name))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name))
      return { name: e.name, size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

// ============ 存档（世界） ============
function listSaves(instanceId) {
  const dir = contentDir(instanceId, 'saves')
  return safeList(dir)
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'level.dat')))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name))
      const icon = path.join(dir, e.name, 'icon.png')
      return {
        name: e.name,
        mtime: st.mtimeMs,
        hasIcon: fs.existsSync(icon),
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

// 读取存档图标为 base64 data-url
function getSaveIcon(instanceId, saveName) {
  const p = path.join(contentDir(instanceId, 'saves'), saveName, 'icon.png')
  if (!fs.existsSync(p)) return null
  const buf = fs.readFileSync(p)
  return 'data:image/png;base64,' + buf.toString('base64')
}

// ============ 截图 ============
function listScreenshots(instanceId) {
  const dir = contentDir(instanceId, 'screenshots')
  return safeList(dir)
    .filter((e) => e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name))
      return { name: e.name, size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function getScreenshotData(instanceId, fileName) {
  const p = path.join(contentDir(instanceId, 'screenshots'), fileName)
  if (!fs.existsSync(p)) return null
  const buf = fs.readFileSync(p)
  const ext = path.extname(fileName).slice(1).toLowerCase() === 'png' ? 'png' : 'jpeg'
  return `data:image/${ext};base64,` + buf.toString('base64')
}

// ============ 通用删除 ============
function deleteFile(instanceId, sub, name) {
  const p = path.join(contentDir(instanceId, sub), name)
  if (!fs.existsSync(p)) return { success: false, error: '文件不存在' }
  fs.rmSync(p, { recursive: true, force: true })
  logger.info('mod', `已删除 ${sub}/${name}`, { instanceId })
  return { success: true }
}

function openDir(instanceId, sub) {
  const dir = contentDir(instanceId, sub)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ============ 从 Modrinth 安装内容（资源包/光影） ============
async function installContentFromModrinth(instanceId, projectId, sub) {
  const { gameVersion } = detectInstanceInfo(instanceId)
  const versions = await getModVersions(projectId, '', gameVersion)
  if (!versions.length) throw new Error('该资源没有适配此实例游戏版本的文件')
  const v = versions[0]
  const file = v.files.find((f) => f.primary) || v.files[0]
  if (!file) throw new Error('没有可下载的文件')
  const dir = contentDir(instanceId, sub)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, file.filename)
  await downloadFile(file.url, dest, { timeout: 120000 })
  logger.info('mod', `已安装内容 ${file.filename}`, { instanceId, sub })
  return { success: true, fileName: file.filename, versionNumber: v.version_number }
}

// ============ 存档导出（备份为 zip） ============
async function exportSave(instanceId, saveName) {
  const { dialog } = require('electron')
  const win = _mainWindowGetter && _mainWindowGetter()
  const res = await dialog.showSaveDialog(win, {
    title: '导出存档',
    defaultPath: `${saveName}.zip`,
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  })
  if (res.canceled || !res.filePath) return { success: false, error: '已取消' }
  const src = path.join(contentDir(instanceId, 'saves'), saveName)
  if (!fs.existsSync(src)) return { success: false, error: '存档不存在' }
  const zip = new AdmZip()
  zip.addLocalFolder(src, saveName)
  zip.writeZip(res.filePath)
  logger.info('mod', `已导出存档 ${saveName}`, { to: res.filePath })
  return { success: true, filePath: res.filePath }
}

// ============ 整合包导出（Modrinth .mrpack，内容打入 overrides） ============
async function exportModpack(instanceId) {
  const { dialog } = require('electron')
  const info = detectInstanceInfo(instanceId)
  const win = _mainWindowGetter && _mainWindowGetter()
  const res = await dialog.showSaveDialog(win, {
    title: '导出整合包',
    defaultPath: `${instanceId}.mrpack`,
    filters: [{ name: 'Modrinth 整合包', extensions: ['mrpack'] }],
  })
  if (res.canceled || !res.filePath) return { success: false, error: '已取消' }

  const base = instanceDir(instanceId)
  const zip = new AdmZip()
  // overrides 携带实际内容
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'config']) {
    const d = path.join(base, sub)
    if (fs.existsSync(d)) zip.addLocalFolder(d, `overrides/${sub}`)
  }
  for (const f of ['options.txt', 'servers.dat']) {
    const p = path.join(base, f)
    if (fs.existsSync(p)) zip.addLocalFile(p, 'overrides')
  }
  // 解析 loader 版本（尽力）
  const dependencies = { minecraft: info.gameVersion }
  const idLower = instanceId.toLowerCase()
  const mFabric = idLower.match(/fabric-loader-([0-9.]+)-/)
  const mQuilt = idLower.match(/quilt-loader-([0-9.]+)-/)
  if (info.loader === 'fabric' && mFabric) dependencies['fabric-loader'] = mFabric[1]
  else if (info.loader === 'quilt' && mQuilt) dependencies['quilt-loader'] = mQuilt[1]

  const index = {
    formatVersion: 1,
    game: 'MINECRAFT',
    versionId: instanceId,
    name: instanceId,
    summary: 'NUO OS 导出的整合包',
    files: [],
    dependencies,
  }
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf8'))
  zip.writeZip(res.filePath)
  logger.info('mod', `已导出整合包 ${instanceId}`, { to: res.filePath })
  return { success: true, filePath: res.filePath }
}

// ============ 整合包导入（.mrpack → 现有实例） ============
async function importModpack(instanceId) {
  const { dialog } = require('electron')
  const win = _mainWindowGetter && _mainWindowGetter()
  const res = await dialog.showOpenDialog(win, {
    title: '导入整合包',
    properties: ['openFile'],
    filters: [{ name: 'Modrinth 整合包', extensions: ['mrpack', 'zip'] }],
  })
  if (res.canceled || !res.filePaths[0]) return { success: false, error: '已取消' }
  const filePath = res.filePaths[0]
  const base = instanceDir(instanceId)

  const zip = new AdmZip(filePath)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) return { success: false, error: '不是有效的 Modrinth 整合包（缺少 modrinth.index.json）' }
  const index = JSON.parse(indexEntry.getData().toString('utf8'))

  let downloaded = 0
  let failed = 0
  // 下载 files 清单中的文件
  for (const f of (index.files || [])) {
    const rel = String(f.path || '').replace(/^\/+/, '')
    const url = (f.downloads && f.downloads[0]) || ''
    if (!rel || !url) continue
    const dest = path.join(base, rel)
    if (fs.existsSync(dest)) { downloaded++; continue }
    try {
      await downloadFile(url, dest, { timeout: 180000 })
      downloaded++
    } catch (e) {
      failed++
      logger.warn('mod', `整合包文件下载失败 ${rel}`, { error: e.message })
    }
  }
  // 应用 overrides
  const entries = zip.getEntries()
  for (const entry of entries) {
    const name = entry.entryName
    if (!name.startsWith('overrides/') || entry.isDirectory) continue
    const rel = name.slice('overrides/'.length)
    if (!rel) continue
    const dest = path.join(base, rel)
    const destDir = path.dirname(dest)
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(dest, entry.getData())
  }
  logger.info('mod', `整合包导入完成`, { instanceId, downloaded, failed })
  return { success: true, downloaded, failed, name: index.name }
}

// ============ 模组更新检查（Modrinth） ============
async function checkModUpdates(instanceId) {
  const mods = listInstalledMods(instanceId)
  const { gameVersion, loader } = detectInstanceInfo(instanceId)
  const results = []
  for (const m of mods) {
    if (!m.modrinthProjectId) { results.push({ ...m, hasUpdate: false, reason: '非 Modrinth 来源' }); continue }
    try {
      const versions = await getModVersions(m.modrinthProjectId, loader === 'vanilla' ? '' : loader, gameVersion)
      if (!versions.length) { results.push({ ...m, hasUpdate: false }); continue }
      const latest = versions[0]
      const hasUpdate = latest.version_number !== m.versionNumber
      results.push({ ...m, hasUpdate, latestVersion: latest.version_number, latestVersionId: latest.id })
    } catch (e) {
      results.push({ ...m, hasUpdate: false, reason: e.message })
    }
  }
  return results
}

// 升级单个模组到最新版
async function updateMod(instanceId, projectId, latestVersionId, oldFileName) {
  const { gameVersion, loader } = detectInstanceInfo(instanceId)
  const versions = await getModVersions(projectId, loader === 'vanilla' ? '' : loader, gameVersion)
  const v = versions.find((x) => x.id === latestVersionId) || versions[0]
  if (!v) throw new Error('找不到新版本')
  const file = v.files.find((f) => f.primary) || v.files[0]
  const modsDir = contentDir(instanceId, 'mods')
  const dest = path.join(modsDir, file.filename)
  await downloadFile(file.url, dest, { timeout: 120000 })
  // 删除旧文件
  if (oldFileName && oldFileName !== file.filename) {
    const oldPath = path.join(modsDir, oldFileName)
    if (fs.existsSync(oldPath)) fs.rmSync(oldPath, { force: true })
  }
  // 更新元数据
  const metaPath = path.join(modsDir, '.nuo-mods.json')
  let meta = {}
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { }
  meta[file.filename] = { modrinthProjectId: projectId, versionNumber: v.version_number, name: v.name }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
  return { success: true, fileName: file.filename, versionNumber: v.version_number }
}

function register(ipcMain, getMainWindow) {
  _mainWindowGetter = getMainWindow
  ipcMain.handle('content:resourcepacks', (_e, id) => listResourcePacks(id))
  ipcMain.handle('content:shaderpacks', (_e, id) => listShaderPacks(id))
  ipcMain.handle('content:saves', (_e, id) => listSaves(id))
  ipcMain.handle('content:save-icon', (_e, id, name) => getSaveIcon(id, name))
  ipcMain.handle('content:screenshots', (_e, id) => listScreenshots(id))
  ipcMain.handle('content:screenshot-data', (_e, id, name) => getScreenshotData(id, name))
  ipcMain.handle('content:delete', (_e, id, sub, name) => deleteFile(id, sub, name))
  ipcMain.handle('content:open-dir', (_e, id, sub) => openDir(id, sub))
  ipcMain.handle('content:install-modrinth', (_e, id, pid, sub) => installContentFromModrinth(id, pid, sub))
  ipcMain.handle('content:export-save', (_e, id, name) => exportSave(id, name))
  ipcMain.handle('content:export-modpack', (_e, id) => exportModpack(id))
  ipcMain.handle('content:import-modpack', (_e, id) => importModpack(id))
  ipcMain.handle('content:check-mod-updates', (_e, id) => checkModUpdates(id))
  ipcMain.handle('content:update-mod', (_e, id, pid, vid, old) => updateMod(id, pid, vid, old))
}

module.exports = { register }
