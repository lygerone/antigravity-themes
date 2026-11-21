import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_APP_PATH = '/Applications/Antigravity.app';
export const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), '.antigravity-themes', 'backups');

function runCommand(command, args, { allowFailure = false } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
      stderr: '',
    };
  } catch (err) {
    if (allowFailure) {
      return {
        ok: false,
        stdout: String(err.stdout ?? '').trim(),
        stderr: String(err.stderr ?? err.message ?? '').trim(),
      };
    }
    const detail = String(err.stderr ?? err.stdout ?? err.message ?? '').trim();
    throw new Error(`Command failed (${command} ${args.join(' ')}): ${detail}`);
  }
}

/**
 * 校验并解析 macOS Antigravity.app 路径与元数据
 */
export function inspectMacApp(appPath = DEFAULT_APP_PATH) {
  if (process.platform !== 'darwin') {
    throw new Error(`Unsupported platform "${process.platform}": antigravity-themes targets macOS (darwin)`);
  }

  const resolvedAppPath = path.resolve(appPath);
  const infoPlistPath = path.join(resolvedAppPath, 'Contents', 'Info.plist');
  const resourcesDir = path.join(resolvedAppPath, 'Contents', 'Resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const executablePath = path.join(resolvedAppPath, 'Contents', 'MacOS', 'Antigravity');

  if (!fs.existsSync(resolvedAppPath)) {
    throw new Error(`Antigravity.app not found at "${resolvedAppPath}"`);
  }
  if (!fs.existsSync(infoPlistPath)) {
    throw new Error(`Missing Info.plist at "${infoPlistPath}"`);
  }
  if (!fs.existsSync(asarPath)) {
    throw new Error(`Missing Resources/app.asar at "${asarPath}"`);
  }

  const bundleVersion = runCommand('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    infoPlistPath,
  ]).stdout;

  const bundleIdentifier = runCommand('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleIdentifier',
    infoPlistPath,
  ]).stdout;

  const plistAsarHash = readPlistAsarHash(infoPlistPath);

  const archRes = fs.existsSync(executablePath)
    ? runCommand('/usr/bin/file', [executablePath], { allowFailure: true })
    : { ok: false, stdout: '' };
  const isArm64 = archRes.stdout.includes('arm64');

  const codesignRes = runCommand('/usr/bin/codesign', ['--verify', '--deep', '--strict', resolvedAppPath], {
    allowFailure: true,
  });

  const runningRes = runCommand('/usr/bin/pgrep', ['-x', 'Antigravity'], { allowFailure: true });
  const runningPids = runningRes.ok
    ? runningRes.stdout
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    appPath: resolvedAppPath,
    infoPlistPath,
    resourcesDir,
    asarPath,
    bundleVersion,
    bundleIdentifier,
    plistAsarHash,
    isArm64,
    codesignValid: codesignRes.ok,
    codesignDetail: codesignRes.stderr || codesignRes.stdout,
    runningPids,
  };
}

/**
 * 读取 Info.plist 中 ElectronAsarIntegrity 记录的 app.asar Header SHA-256；未启用该校验时返回 null
 */
export function readPlistAsarHash(infoPlistPath) {
  const res = runCommand(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :ElectronAsarIntegrity:Resources/app.asar:hash', infoPlistPath],
    { allowFailure: true }
  );
  return res.ok ? res.stdout : null;
}

/**
 * 获取当前宿主版本对应的独立备份目录路径（不触碰应用内的 app.asar.bak）
 */
export function getVersionBackupDir(bundleVersion, backupRoot = DEFAULT_BACKUP_ROOT) {
  const safeVersion = String(bundleVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(backupRoot, safeVersion);
}

/**
 * 首次打补丁前保存当前 app.asar 与 Info.plist 的独立快照。
 * 快照必须是打皮肤补丁之前的状态：当前 app.asar 已含皮肤补丁且还没有快照时拒绝创建。
 */
export function ensureInitialBackup(appInfo, { currentAsarHasThemePatch, backupRoot = DEFAULT_BACKUP_ROOT }) {
  if (typeof currentAsarHasThemePatch !== 'boolean') {
    throw new Error(`ensureInitialBackup requires a boolean currentAsarHasThemePatch, got ${currentAsarHasThemePatch}`);
  }
  const backupDir = getVersionBackupDir(appInfo.bundleVersion, backupRoot);
  const backupAsarPath = path.join(backupDir, 'app.asar');
  const backupPlistPath = path.join(backupDir, 'Info.plist');
  const backupMetaPath = path.join(backupDir, 'meta.json');

  if (fs.existsSync(backupAsarPath) && fs.existsSync(backupPlistPath)) {
    return { created: false, backupDir, backupAsarPath, backupPlistPath };
  }
  if (currentAsarHasThemePatch) {
    throw new Error(
      `Refusing to create the initial backup in "${backupDir}": the current app.asar already contains antigravity-themes patches, so it is not a pre-patch snapshot. Run "restore" first to strip them, then run "apply" again.`
    );
  }

  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(appInfo.asarPath, backupAsarPath);
  fs.copyFileSync(appInfo.infoPlistPath, backupPlistPath);
  fs.writeFileSync(
    backupMetaPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        appPath: appInfo.appPath,
        bundleVersion: appInfo.bundleVersion,
        bundleIdentifier: appInfo.bundleIdentifier,
        plistAsarHash: appInfo.plistAsarHash,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  return { created: true, backupDir, backupAsarPath, backupPlistPath };
}

/**
 * 原子写入新的 app.asar（处理权限不足时给出明确报错提示）
 */
export function replaceAsarAtomically(asarPath, nextAsarBuffer) {
  const tempPath = `${asarPath}.antigravity-themes.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, nextAsarBuffer, { mode: 0o644 });
    fs.renameSync(tempPath, asarPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(
        `Permission denied when updating "${asarPath}" (${err.code}). Please run with sudo or grant write access to its parent directory.`
      );
    }
    throw err;
  }
}

/**
 * 更新 Info.plist 中的 ElectronAsarIntegrity SHA-256 哈希
 */
export function updatePlistAsarIntegrity(infoPlistPath, newHeaderSha256) {
  if (readPlistAsarHash(infoPlistPath) === null) {
    return false;
  }

  runCommand('/usr/libexec/PlistBuddy', [
    '-c',
    `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${newHeaderSha256}`,
    infoPlistPath,
  ]);
  return true;
}

/**
 * 对修改后的 macOS ARM64 应用执行 Ad-hoc 重签
 */
export function resignMacAppAdhoc(appPath) {
  runCommand('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath]);
}
