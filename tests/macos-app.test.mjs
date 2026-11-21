import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureInitialBackup, readPlistAsarHash } from '../src/macos-app.mjs';

function withTempDir(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-themes-test-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function plistXml(dictBody) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${dictBody}</dict></plist>
`;
}

test('首次备份：当前 asar 已含皮肤补丁时拒绝建快照，干净时正常创建，已有快照时不覆盖', () => {
  withTempDir((root) => {
    const appInfo = {
      appPath: path.join(root, 'Antigravity.app'),
      asarPath: path.join(root, 'app.asar'),
      infoPlistPath: path.join(root, 'Info.plist'),
      bundleVersion: '9.9.9',
      bundleIdentifier: 'com.example.antigravity',
      plistAsarHash: null,
    };
    fs.writeFileSync(appInfo.asarPath, 'clean asar bytes');
    fs.writeFileSync(appInfo.infoPlistPath, plistXml(''));
    const backupRoot = path.join(root, 'backups');

    assert.throws(
      () => ensureInitialBackup(appInfo, { currentAsarHasThemePatch: true, backupRoot }),
      /Refusing to create the initial backup .* already contains antigravity-themes patches/
    );
    assert.equal(fs.existsSync(path.join(backupRoot, '9.9.9', 'app.asar')), false);

    const created = ensureInitialBackup(appInfo, { currentAsarHasThemePatch: false, backupRoot });
    assert.equal(created.created, true);
    assert.equal(fs.readFileSync(created.backupAsarPath, 'utf8'), 'clean asar bytes');

    fs.writeFileSync(appInfo.asarPath, 'patched asar bytes');
    const existing = ensureInitialBackup(appInfo, { currentAsarHasThemePatch: true, backupRoot });
    assert.equal(existing.created, false);
    assert.equal(fs.readFileSync(existing.backupAsarPath, 'utf8'), 'clean asar bytes', '已有快照不能被覆盖');

    assert.throws(
      () => ensureInitialBackup(appInfo, { backupRoot }),
      /requires a boolean currentAsarHasThemePatch, got undefined/
    );
  });
});

test('readPlistAsarHash 读取 ElectronAsarIntegrity 哈希，未启用时返回 null', { skip: process.platform !== 'darwin' }, () => {
  withTempDir((root) => {
    const withHash = path.join(root, 'with-hash.plist');
    const withoutHash = path.join(root, 'without-hash.plist');
    fs.writeFileSync(
      withHash,
      plistXml(
        '<key>ElectronAsarIntegrity</key><dict><key>Resources/app.asar</key><dict>' +
          '<key>algorithm</key><string>SHA256</string><key>hash</key><string>abc123</string></dict></dict>'
      )
    );
    fs.writeFileSync(withoutHash, plistXml('<key>CFBundleIdentifier</key><string>com.example</string>'));

    assert.equal(readPlistAsarHash(withHash), 'abc123');
    assert.equal(readPlistAsarHash(withoutHash), null);
  });
});
