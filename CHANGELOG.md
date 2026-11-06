# 更新日志 / Changelog

本项目所有显著变更均记录于此文件。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## [1.4.0] - 2026-11-06

### 新增
- **资源管理页**：资源包、光影、存档、截图的统一管理（列表 / 删除 / 打开文件夹）
- **Modrinth 内容安装**：在启动器内直接搜索并安装资源包与光影（此前仅支持模组）
- **存档管理**：列出世界存档、一键导出为 zip 备份
- **截图管理**：缩略图预览、点击放大、删除
- **整合包导入 / 导出**：导入社区 Modrinth 整合包（.mrpack）到当前实例；把当前实例打包为 .mrpack 分享
- **NeoForge + Quilt 一键安装**：补齐主流 Mod 加载器（此前仅 Fabric 可一键安装，Forge/Optifine 仅能看列表）
- **模组启用 / 禁用**：模组列表新增开关（.jar ↔ .jar.disabled 重命名），无需删除即可停用
- **模组更新检查**：基于 Modrinth 比对已装模组最新版，一键升级
- **启动后自动进服**：主页可设服务器地址，启动后自动连接（1.20+ 用 quickPlay，旧版用 --server/--port）
- **游戏时长统计**：自动记录每个版本的累计游玩时长并显示在主页
- **日志一键分享**：日志页新增「分享」，上传 mclo.gs 生成可分享链接

### 变更
- 实例加载器检测更精准（识别 Fabric / Forge / NeoForge / Quilt / OptiFine）
- 模组列表读取 `.nuo-mods.json` 元数据，记录 Modrinth 来源

---

## [1.1.0] - 2026-09-13

### 新增
- **联机大厅**：支持创建 / 加入房间、房间密码（SHA-256 校验）、局域网房间自动发现（Minecraft 官方多播协议 224.0.2.60:4445）
- **跨网联机**：基于 UPnP IGD（SSDP + SOAP）自动映射端口并返回公网 IP，无需手动进路由器设置
- **自动更新检测**：启动器可检查 GitHub Releases 上的最新版本，一键下载新版安装包
- **AI 测速**：并发探测内置免费通道延迟，自动按速度排序优先使用最快通道
- **基岩版支持**：通过微软商店 API 获取 appx 包，一键注册安装并从 `shell:appsFolder` 启动
- **Java 自动适配**：读取版本 JSON 官方声明的 `javaVersion.majorVersion`，自动下载对应 JRE（支持 Java 25 等新版本）
- 开发者模式新增独立的配色配置页面

### 变更
- AI 助手全面改为**免 API 密钥**，多免费通道（OVHcloud / Pollinations）自动轮换，删除所有密钥输入区域
- 资源下载改为多源回退（Mojang 官方源 / BMCLAPI 镜像源）
- 背景渐变随主题色自动生成（暗色 / 亮色双方案）

### 修复
- 修复资源 URL 多拼 `objects/` 段导致的 5057 个资源全部 404
- 修复 JVM 参数重复传递 classpath 导致的命令行超长（ENAMETOOLONG）
- 修复未处理 `arguments.rules.features` 导致 quickPlay 参数冲突、游戏崩溃
- 修复基岩版 wiki 数据被 Cloudflare 拦截（隐藏窗口通过挑战获取 cookie）
- 修复亮色主题下硬编码颜色导致的显示异常，全面改用 CSS 变量
- 修复图标未嵌入 exe 的问题（移除 `signAndEditExecutable:false`，使用多尺寸 ICO）

---

## [1.0.0] - 2026-09-12

### 新增
- **Java 版下载与启动**：解析 Mojang 官方版本清单，支持原版 / Forge / Fabric
- 自动下载并管理游戏所需的 Java 运行时
- 账号管理（离线账号）
- 主题系统：明 / 暗双主题，切换即时生效（`data-theme`）
- 开发者模式（密码进入，状态持久化，底部绿色徽标）
- 完整日志系统：主页启动日志、下载安装日志、独立日志页
- Mod 管理页面
- 关于页面与设置页面
- Electron + React + Vite 技术栈，electron-builder 打包便携版 / 安装版
