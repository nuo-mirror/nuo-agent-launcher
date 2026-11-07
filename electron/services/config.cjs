// 配置服务：所有用户设置的统一存储
// 单文件 JSON 持久化，包含游戏路径、Java 内存、下载源、主题、账号活跃 ID 等
const fs = require('fs')
const path = require('path')

const CONFIG_FILE = process.env.NAL_CONFIG_FILE || path.join(process.env.APPDATA || '', 'NuoAgentLauncher', 'config.json')

// 默认配置：首次启动时初始化
const DEFAULT_CONFIG = {
  // 启动器元数据
  version: '1.0.0',
  initialized: false,
  // 主题：dark / light
  theme: 'dark',
  // 游戏根目录：默认在 app 数据目录下的 versions
  gameRoot: process.env.NAL_VERSIONS_DIR || '',
  // 下载源：official (Mojang 官方) / bmclapi / mcbbs
  downloadSource: 'official',
  // Java 设置
  javaMemory: 2048, // MB
  javaExtraArgs: '-XX:+UseG1GC -XX:+UseAdaptiveSizePolicy',
  // 启动设置
  autoSelectJava: true,
  showLogOnLaunch: true,
  // 当前活跃账号 ID
  activeAccountId: null,
  // 联机设置
  lastRoomName: '',
  // 窗口设置
  windowSize: { width: 1180, height: 760 },
  // 自定义主页显示
  showSnapshotVersions: false,
  // 启动器更新通道
  updateChannel: 'stable',
  // 启动器更新下载镜像：auto（自动测速）/ direct（官方直连）/ 镜像名（见 updater.cjs MIRRORS）
  updateMirror: 'auto',
  // 备用更新源：可公开访问的 JSON 清单地址（留空则走 GitHub API 官方源）
  // 适用场景：GitHub 不可达时，用自建清单 + 其它下载地址替代
  updateFeedUrl: 'https://raw.githubusercontent.com/nuo-mirror/nuo-agent-launcher/main/update.json',
  // 个性化：自定义背景图片（本地文件路径，'' = 无）、主题强调色（十六进制，'' = 默认）
  bgImage: '',
  accentColor: '',
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      const dir = path.dirname(CONFIG_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8')
      return { ...DEFAULT_CONFIG }
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    const data = JSON.parse(raw || '{}')
    return { ...DEFAULT_CONFIG, ...data, initialized: true }
  } catch (e) {
    console.error('Load config failed:', e)
    return { ...DEFAULT_CONFIG }
  }
}

function saveConfig(cfg) {
  try {
    const dir = path.dirname(CONFIG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
  } catch (e) {
    console.error('Save config failed:', e)
  }
}

let _config = null

function getConfig() {
  if (!_config) _config = loadConfig()
  return _config
}

function register(ipcMain) {
  ipcMain.handle('config:getAll', () => getConfig())
  ipcMain.handle('config:get', (_e, key) => getConfig()[key])
  ipcMain.handle('config:set', (_e, key, value) => {
    const cfg = getConfig()
    cfg[key] = value
    _config = cfg
    saveConfig(cfg)
    return cfg
  })
  ipcMain.handle('config:setAll', (_e, data) => {
    _config = { ...getConfig(), ...data }
    saveConfig(_config)
    return _config
  })
  // 导入背景图片：弹文件选择框 → 复制到配置目录 custom/bg.<ext>
  ipcMain.handle('config:import-bg-image', async () => {
    try {
      const { dialog } = require('electron')
      const r = await dialog.showOpenDialog({
        title: '选择背景图片',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
        properties: ['openFile'],
      })
      if (r.canceled || !r.filePaths[0]) return { success: false, canceled: true }
      const src = r.filePaths[0]
      const ext = path.extname(src).toLowerCase() || '.png'
      const dir = path.join(path.dirname(CONFIG_FILE), 'custom')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('bg.')) { try { fs.rmSync(path.join(dir, f), { force: true }) } catch { } }
      }
      const dest = path.join(dir, 'bg' + ext)
      fs.copyFileSync(src, dest)
      const cfg = getConfig()
      cfg.bgImage = dest
      _config = cfg
      saveConfig(cfg)
      return { success: true, path: dest }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  // 读取背景图片（data URL，供渲染进程显示，避免 file:// 受限）
  ipcMain.handle('config:get-bg-image', () => {
    try {
      const p = getConfig().bgImage
      if (!p || !fs.existsSync(p)) return null
      let ext = path.extname(p).slice(1).toLowerCase()
      if (ext === 'jpg') ext = 'jpeg'
      if (!ext) ext = 'png'
      const b64 = fs.readFileSync(p).toString('base64')
      return `data:image/${ext};base64,${b64}`
    } catch {
      return null
    }
  })
  ipcMain.handle('config:clear-bg-image', () => {
    const p = getConfig().bgImage
    if (p && fs.existsSync(p)) { try { fs.rmSync(p, { force: true }) } catch { } }
    const cfg = getConfig()
    cfg.bgImage = ''
    _config = cfg
    saveConfig(cfg)
    return true
  })
}

module.exports = { register, getConfig, saveConfig }
