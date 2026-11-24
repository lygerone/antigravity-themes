# antigravity-themes

<p align="left">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>

面向 **macOS (Apple Silicon / ARM64)** 桌面版 **Antigravity** 的双色主题库、三栏布局精修与零依赖实时皮肤切换工具。

## 特性

* **6 套精调双色主题（Light + Dark 共 12 套配色）**：
  * **`iris`（默认）**：纯白画布 + 极轻紫雾侧栏 / 深黑曜石紫
  * **`slate`**：冷岩极客白 / 深海 Slate 暗蓝
  * **`mono`**：画廊纯白中性灰 / OLED 纯黑
  * **`stone`**：清透暖石白 / 浓缩炭黑
  * **`emerald`**：清冽雾青 / 深松黑曜
  * **`midnight`**：冰白靛蓝 / 深空蓝黑
* **对齐宿主原生 4 级墨阶与半透明状态层**：
  * 精准区分 `--foreground`（100% 主文）、`--secondary-foreground`（~74% 次级正文）、`--muted-foreground`（~56% 辅助说明）与 `--placeholder`（~42% 占位提示），全部 12 套配色均通过自动化 **WCAG AA（`>= 4.5:1`）** 对比度校验。
  * 边框与交互状态采用 `4%–10%` 半透明叠加层，暗色浮层保留 `1px` 顶部高光（`--glass-highlight`），并配套每套主题独立的语法高亮与 Diff 增删高亮。
* **侧边栏顶栏艺术纹理（自动跟随主题与深浅模式变色）**：
  * **`starlight`（默认）**：星空夜幕（渐变夜空 + 星云微光 + 四角星芒 + 柔和云带）
  * **`blueprint`**：蓝图网格（建筑细网格 + 标尺刻度 + 虚线圆弧标注）
  * **`none`**：纯净关闭
* **应用内 `0ms` 实时热切换（无需重启或重打补丁）**：
  * 单次 `apply` 即携带全部 6 套双色主题、3 种顶栏纹理与 2 档界面密度（紧凑 / 舒适）。
  * 在 Antigravity 内按 **`Cmd+Option+T`** 或点击**左侧栏底角调色盘按钮**即可呼出切换器：顶栏支持 **白天 / 黑夜 / 自动** 一键实时切换，内置跟随深浅模式联动的迷你桌面线框预览卡、方向键与 `Tab` 焦点循环，持久化至 `localStorage` 并跨窗口同步。
* **安全、可回滚、与已有补丁共存**：
  * 零第三方 npm 依赖（仅使用 Node.js >= 20 标准库），内置纯 Node.js ASAR 解析/增量打包与 4MB 分块 SHA-256 校验。
  * 采用独立起止标记幂等注入与字节级卸载，**保留已有汉化等其他共存补丁，不覆盖应用内原有 `app.asar.bak`**。
  * 首次应用自动在 `~/.antigravity-themes/backups/<version>/` 生成独立版本快照，自动同步 `Info.plist` `ElectronAsarIntegrity` 并执行 macOS Ad-hoc 重签。
  * 严格保护内置浏览器透明镂空通道（`data-has-browser-hole="true"`）。

## 快速开始

先完全退出 Antigravity 桌面客户端（`Cmd+Q`），然后运行：

```bash
# 免克隆一键安装全部 6 套双色皮肤与内置切换器（默认 iris + starlight 星空顶栏）
npx antigravity-themes apply

# 查看已收录的全部主题与顶栏纹理
npx antigravity-themes themes

# 指定默认启动色与初始预设 / 顶栏纹理
npx antigravity-themes apply --preset slate --backdrop starlight
npx antigravity-themes apply --preset mono --backdrop blueprint

# 校验 ASAR 分块完整性与 macOS 代码签名
npx antigravity-themes verify
```

重新打开 Antigravity 后，随时按 **`Cmd+Option+T`** 或点击左侧栏底角调色盘图标，即可无缝切换皮肤、白天/黑夜/自动模式、顶栏纹理与界面密度。

### 从源码运行

```bash
git clone https://github.com/lygerone/antigravity-themes.git
cd antigravity-themes
node bin/antigravity-themes.mjs apply
node bin/antigravity-themes.mjs verify
```

### 卸载与还原

```bash
# 精准剥离皮肤补丁（保留汉化等其他共存补丁）
npx antigravity-themes restore

# 或从 ~/.antigravity-themes/backups/<version>/ 恢复首次备份快照
npx antigravity-themes restore --from-backup
```

### 代码签名与自动更新

`apply` 和 `restore` 会对 `Antigravity.app` 做 macOS Ad-hoc 重签，Google 的官方签名会被替换。`restore`（包括 `--from-backup`）只还原 `app.asar` 与 `Info.plist`，恢复不了官方签名。这会带来两个影响：

* 应用内自动更新会校验新版本与当前应用的签名是否匹配，打补丁后**自动更新可能失败**。遇到这种情况，请到官网下载最新版重新安装，再执行一次 `npx antigravity-themes apply`。
* 想彻底恢复官方签名，只能重新安装官方版本。

### 升级 Antigravity 后的恢复说明

升级会整包替换 `/Applications/Antigravity.app`，皮肤需要重新应用；你在切换器中选择的主题、明暗模式与密度保存在应用用户数据 `localStorage` 中，不会丢失。

打过补丁的应用是 Ad-hoc 签名，应用内的"更新并重启"通常不会出现（日志里会看到 `Code signature ... did not pass validation`）。升级请按以下步骤手动进行：

1. **安装官方新版**：更新器一般已把新版下载到 `~/Library/Caches/com.google.antigravity/pending/Antigravity.zip`，也可以去官网下载。安装前可以先确认它是 Google 官方签名：

   ```bash
   ditto -x -k ~/Library/Caches/com.google.antigravity/pending/Antigravity.zip /tmp/agy-new
   spctl -a -vv /tmp/agy-new/Antigravity.app   # 应显示 Notarized Developer ID / Google LLC
   ```

   完全退出 Antigravity（`Cmd+Q`），用新版替换 `/Applications/Antigravity.app`。
2. **重装其他补丁**：如果你用了汉化等其他补丁，按它们各自的方式重新安装。
3. **重新应用皮肤**：保持 Antigravity 退出状态，执行：

   ```bash
   npx antigravity-themes@latest apply
   ```

   首次在新版本上 apply 会自动在 `~/.antigravity-themes/backups/<新版本号>/` 生成快照。

## 测试

```bash
npm test
```

## 免责声明

本项目为社区非官方美化工具，与 Google Antigravity 无官方关联。

## License

[MIT](./LICENSE)
