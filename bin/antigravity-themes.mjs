#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  hasAsarEntry,
  readAsarArchive,
  readAsarEntryUtf8,
  rebuildAsarBuffer,
  verifyAsarBuffer,
} from '../src/asar-codec.mjs';
import {
  DEFAULT_APP_PATH,
  ensureInitialBackup,
  getVersionBackupDir,
  inspectMacApp,
  replaceAsarAtomically,
  resignMacAppAdhoc,
  updatePlistAsarIntegrity,
} from '../src/macos-app.mjs';
import {
  inspectPatchState,
  patchPreloadSource,
  patchSplashSource,
  patchUtilsSource,
  stripPreloadSource,
  stripSplashSource,
  stripUtilsSource,
} from '../src/patch-engine.mjs';
import {
  DEFAULT_BACKDROP,
  DEFAULT_PRESET,
  SUPPORTED_BACKDROPS,
  SUPPORTED_PRESETS,
  THEME_NAME,
  THEME_PRESETS,
  THEME_VERSION,
  resolveStageBackdrop,
  resolveThemePreset,
} from '../src/theme-bundle.mjs';

function printUsage() {
  console.log(`antigravity-themes (v${THEME_VERSION}) — Antigravity macOS ARM 皮肤与布局切换工具

用法:
  node bin/antigravity-themes.mjs <command> [options]

命令:
  themes                 列出已收录的全部双色主题与顶栏纹理
  status                 检查宿主版本、皮肤状态、共存补丁、备份与签名状态
  apply                  备份并注入全套双色皮肤与内置切换器（⌘⌥A）
  restore                卸载皮肤（默认精准剥离并保留汉化等其他补丁）
  verify                 校验 app.asar 分块完整性、Info.plist 哈希与 codesign 签名

选项:
  --preset <name>        默认初始主题: ${SUPPORTED_PRESETS.join(' | ')}（默认: ${DEFAULT_PRESET}）
  --backdrop <mode>      默认侧边栏顶栏纹理: ${SUPPORTED_BACKDROPS.join(' | ')}（默认: ${DEFAULT_BACKDROP}）
  --app <path>           指定 Antigravity.app 路径（默认: ${DEFAULT_APP_PATH}）
  --dry-run              仅预演打包与完整性校验，不修改磁盘上的应用
  --force                当检测到 Antigravity 正在运行时允许强制写入（需重启生效）
  --from-backup          仅用于 restore：从首次备份快照完整还原 app.asar 与 Info.plist
  -h, --help             显示帮助信息

提示:
  单次 apply 即包含全部 ${THEME_PRESETS.length} 套双色主题（共 ${THEME_PRESETS.length * 2} 套配色）与 3 种顶栏纹理，
  安装后可在 Antigravity 内随时按 Cmd+Option+A 或点击左侧栏底角调色盘按钮 0ms 实时切换皮肤与白天/黑夜模式。`);
}

function parseCliArgs(argv) {
  const options = {
    command: null,
    appPath: DEFAULT_APP_PATH,
    preset: DEFAULT_PRESET,
    backdrop: DEFAULT_BACKDROP,
    dryRun: false,
    force: false,
    fromBackup: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--from-backup') {
      options.fromBackup = true;
    } else if (arg === '--app') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Option "--app" requires a valid .app path');
      }
      options.appPath = next;
      i += 1;
    } else if (arg === '--preset') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error(`Option "--preset" requires one of: ${SUPPORTED_PRESETS.join(', ')}`);
      }
      options.preset = resolveThemePreset(next);
      i += 1;
    } else if (arg === '--backdrop') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error(`Option "--backdrop" requires one of: ${SUPPORTED_BACKDROPS.join(', ')}`);
      }
      options.backdrop = resolveStageBackdrop(next);
      i += 1;
    } else if (!arg.startsWith('-') && !options.command) {
      options.command = arg;
    } else {
      throw new Error(`Unknown CLI argument: "${arg}"`);
    }
  }
  return options;
}

function readTargetSources(archive) {
  const preloadSource = readAsarEntryUtf8(archive, 'dist/preload.js');
  const utilsSource = readAsarEntryUtf8(archive, 'dist/utils.js');
  const hasSplash = hasAsarEntry(archive, 'dist/provisionSplash.js');
  const splashSource = hasSplash ? readAsarEntryUtf8(archive, 'dist/provisionSplash.js') : null;
  return { preloadSource, utilsSource, splashSource, hasSplash };
}

function handleThemes() {
  console.log(`已收录的 ${THEME_PRESETS.length} 套双色主题（Light + Dark 共 ${THEME_PRESETS.length * 2} 套配色，均含 4 级墨阶与独立语法高亮）:\n`);
  for (const theme of THEME_PRESETS) {
    const marker = theme.id === DEFAULT_PRESET ? '*' : ' ';
    console.log(` ${marker} ${theme.id.padEnd(10)} ${theme.label.padEnd(10)} ${theme.description}`);
  }
  console.log('\n侧边栏顶栏艺术纹理 (--backdrop):');
  console.log(' * starlight  星空夜幕（渐变夜空 + 星云微光 + 星芒 + 云带，随当前主题自动变色）');
  console.log('   blueprint  蓝图网格（建筑网格 + 标尺刻度 + 虚线圆弧标注，随当前主题自动变色）');
  console.log('   none       纯净关闭');
  console.log('\n在应用内按 Cmd+Option+A（或点击左侧栏底角调色盘按钮）可 0ms 实时切换皮肤、明暗模式、顶栏纹理与界面密度。');
}

function handleStatus(options) {
  const appInfo = inspectMacApp(options.appPath);
  const archive = readAsarArchive(appInfo.asarPath);
  const sources = readTargetSources(archive);
  const patchState = inspectPatchState(sources);
  const backupDir = getVersionBackupDir(appInfo.bundleVersion);
  const hasBackup = fs.existsSync(path.join(backupDir, 'app.asar'));
  const hashMatches = !appInfo.plistAsarHash || appInfo.plistAsarHash === archive.headerSha256;

  console.log(`应用路径:   ${appInfo.appPath}`);
  console.log(`应用版本:   ${appInfo.bundleVersion} (${appInfo.bundleIdentifier})`);
  console.log(`架构检查:   ${appInfo.isArm64 ? 'ARM64 (Apple Silicon)' : '非 ARM64（需人工确认）'}`);
  console.log(`进程状态:   ${appInfo.runningPids.length > 0 ? `运行中 (PID: ${appInfo.runningPids.join(', ')})` : '未运行'}`);
  console.log(
    `皮肤状态:   ${
      patchState.installed
        ? `已安装 (${patchState.themeId ?? THEME_NAME}/${patchState.themePreset ?? DEFAULT_PRESET}+${patchState.stageBackdrop ?? DEFAULT_BACKDROP}@${patchState.themeVersion ?? 'unknown'})`
        : '未安装'
    }`
  );
  console.log(
    `细分挂载:   preload=${patchState.preloadPatched ? '已注入' : '未注入'}, sidecar=${patchState.sidecarPatched ? '已注入' : '未注入'}, 窗口底色=${patchState.utilsColorsPatched ? '已对齐' : '默认'}`
  );
  console.log(`共存汉化:   ${patchState.hasChineseLocalization ? '检测到汉化补丁（增量模式会完整保留）' : '无'}`);
  console.log(`独立备份:   ${hasBackup ? backupDir : '尚未创建（首次 apply 自动生成）'}`);
  console.log(`ASAR 哈希:  ${hashMatches ? '与 Info.plist 一致' : '与 Info.plist 不一致'}`);
  console.log(`代码签名:   ${appInfo.codesignValid ? '有效' : `异常 (${appInfo.codesignDetail})`}`);
}

function handleVerify(options) {
  const appInfo = inspectMacApp(options.appPath);
  const asarBuffer = fs.readFileSync(appInfo.asarPath);
  const verified = verifyAsarBuffer(asarBuffer, appInfo.plistAsarHash ?? undefined);

  if (!appInfo.codesignValid) {
    throw new Error(`macOS codesign verification failed: ${appInfo.codesignDetail}`);
  }

  console.log('校验通过:');
  console.log(`  - ASAR 文件完整性: ${verified.verifiedFileCount} 个内联文件分块 SHA-256 全部通过`);
  console.log(`  - ElectronAsarIntegrity: ${verified.headerSha256}`);
  console.log('  - macOS codesign: --verify --deep --strict 通过');
}

function handleApply(options) {
  const preset = resolveThemePreset(options.preset);
  const backdrop = resolveStageBackdrop(options.backdrop);
  const appInfo = inspectMacApp(options.appPath);
  if (appInfo.runningPids.length > 0 && !options.force && !options.dryRun) {
    throw new Error(
      `Antigravity is currently running (PID: ${appInfo.runningPids.join(', ')}). Please quit Antigravity first, or pass --force to patch anyway.`
    );
  }

  const archive = readAsarArchive(appInfo.asarPath);
  const sources = readTargetSources(archive);

  const nextPreload = patchPreloadSource(sources.preloadSource, preset, backdrop);
  const utilsPatch = patchUtilsSource(sources.utilsSource, preset);
  const overrides = new Map([
    ['dist/preload.js', Buffer.from(nextPreload, 'utf8')],
    ['dist/utils.js', Buffer.from(utilsPatch.content, 'utf8')],
  ]);

  let splashPatch = null;
  if (sources.hasSplash && sources.splashSource !== null) {
    splashPatch = patchSplashSource(sources.splashSource, preset);
    overrides.set('dist/provisionSplash.js', Buffer.from(splashPatch.content, 'utf8'));
  }

  const rebuilt = rebuildAsarBuffer(archive, overrides);
  const selfCheck = verifyAsarBuffer(rebuilt.buffer, rebuilt.headerSha256);

  console.log(`预检通过 (${THEME_NAME}/${preset}+${backdrop}@${THEME_VERSION}):`);
  console.log(`  - 目标版本: ${appInfo.bundleVersion}`);
  console.log(`  - 内置主题: 全部 ${THEME_PRESETS.length} 套双色主题（默认 ${preset}，顶栏 ${backdrop}）`);
  console.log(`  - Sidecar 注入: ${utilsPatch.sidecarInjected ? '已挂接' : '未匹配锚点（已跳过）'}`);
  console.log(`  - 窗口底色对齐: ${utilsPatch.appliedColors.join(', ') || '无'}`);
  if (splashPatch) {
    console.log(`  - 启动等待窗底色: ${splashPatch.appliedColors.join(', ') || '无'}`);
  }
  console.log(`  - 重打包体积: ${archive.buffer.length} B -> ${rebuilt.buffer.length} B`);
  console.log(`  - 新 Header SHA-256: ${rebuilt.headerSha256} (校验 ${selfCheck.verifiedFileCount} 个文件)`);

  if (options.dryRun) {
    console.log('[dry-run] 预演完成，未修改磁盘上的任何文件。');
    return;
  }

  const backup = ensureInitialBackup(appInfo);
  console.log(`独立备份: ${backup.created ? '已新建' : '已存在'} -> ${backup.backupDir}`);

  replaceAsarAtomically(appInfo.asarPath, rebuilt.buffer);
  const plistUpdated = updatePlistAsarIntegrity(appInfo.infoPlistPath, rebuilt.headerSha256);
  resignMacAppAdhoc(appInfo.appPath);

  const postInfo = inspectMacApp(appInfo.appPath);
  verifyAsarBuffer(fs.readFileSync(postInfo.asarPath), postInfo.plistAsarHash ?? undefined);
  if (!postInfo.codesignValid) {
    throw new Error(`Post-patch codesign check failed: ${postInfo.codesignDetail}`);
  }

  console.log('应用成功:');
  console.log(`  - ElectronAsarIntegrity: ${plistUpdated ? '已同步更新' : '未启用'}`);
  console.log('  - macOS Ad-hoc 重签: 已通过校验');
  console.log(`重新打开 Antigravity 后，按 Cmd+Option+A 或点击左侧栏底角调色盘按钮即可随时切换 ${THEME_PRESETS.length} 套双色皮肤与白天/黑夜模式。`);
}

function handleRestore(options) {
  const appInfo = inspectMacApp(options.appPath);
  if (appInfo.runningPids.length > 0 && !options.force && !options.dryRun) {
    throw new Error(
      `Antigravity is currently running (PID: ${appInfo.runningPids.join(', ')}). Please quit Antigravity first, or pass --force to restore anyway.`
    );
  }

  if (options.fromBackup) {
    const backupDir = getVersionBackupDir(appInfo.bundleVersion);
    const backupAsarPath = path.join(backupDir, 'app.asar');
    const backupPlistPath = path.join(backupDir, 'Info.plist');
    if (!fs.existsSync(backupAsarPath) || !fs.existsSync(backupPlistPath)) {
      throw new Error(`Backup snapshot not found for version ${appInfo.bundleVersion} in "${backupDir}"`);
    }
    const backupAsarBuf = fs.readFileSync(backupAsarPath);
    const verified = verifyAsarBuffer(backupAsarBuf);

    if (options.dryRun) {
      console.log(`[dry-run] 将从快照还原: ${backupDir} (SHA-256: ${verified.headerSha256})`);
      return;
    }

    replaceAsarAtomically(appInfo.asarPath, backupAsarBuf);
    fs.copyFileSync(backupPlistPath, appInfo.infoPlistPath);
    resignMacAppAdhoc(appInfo.appPath);
    console.log(`已从独立备份快照完整还原 (${backupDir}) 并完成重签。`);
    return;
  }

  const archive = readAsarArchive(appInfo.asarPath);
  const sources = readTargetSources(archive);
  const state = inspectPatchState(sources);

  if (!state.installed && !state.sidecarPatched && !state.utilsColorsPatched && !state.splashColorsPatched) {
    console.log('当前应用未检测到 antigravity-themes 皮肤补丁，无需卸载。');
    return;
  }

  const overrides = new Map([
    ['dist/preload.js', Buffer.from(stripPreloadSource(sources.preloadSource), 'utf8')],
    ['dist/utils.js', Buffer.from(stripUtilsSource(sources.utilsSource), 'utf8')],
  ]);
  if (sources.hasSplash && sources.splashSource !== null) {
    overrides.set('dist/provisionSplash.js', Buffer.from(stripSplashSource(sources.splashSource), 'utf8'));
  }

  const rebuilt = rebuildAsarBuffer(archive, overrides);
  verifyAsarBuffer(rebuilt.buffer, rebuilt.headerSha256);

  if (options.dryRun) {
    console.log(`[dry-run] 预演卸载完成，新 Header SHA-256: ${rebuilt.headerSha256}`);
    return;
  }

  replaceAsarAtomically(appInfo.asarPath, rebuilt.buffer);
  updatePlistAsarIntegrity(appInfo.infoPlistPath, rebuilt.headerSha256);
  resignMacAppAdhoc(appInfo.appPath);

  const postInfo = inspectMacApp(appInfo.appPath);
  verifyAsarBuffer(fs.readFileSync(postInfo.asarPath), postInfo.plistAsarHash ?? undefined);
  if (!postInfo.codesignValid) {
    throw new Error(`Post-restore codesign check failed: ${postInfo.codesignDetail}`);
  }

  console.log('已精准卸载 antigravity-themes 皮肤补丁（保留其他共存补丁），校验与重签通过。');
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  if (options.command === 'themes') {
    handleThemes();
  } else if (options.command === 'status') {
    handleStatus(options);
  } else if (options.command === 'apply') {
    handleApply(options);
  } else if (options.command === 'restore') {
    handleRestore(options);
  } else if (options.command === 'verify') {
    handleVerify(options);
  } else {
    throw new Error(`Unknown command "${options.command}". Expected one of: themes, status, apply, restore, verify`);
  }
}

try {
  main();
} catch (err) {
  console.error(`[antigravity-themes] 错误: ${err.message}`);
  process.exit(1);
}
