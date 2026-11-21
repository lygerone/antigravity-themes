import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  computeFileIntegrity,
  parseAsarBuffer,
  readAsarArchive,
  readAsarEntryUtf8,
  rebuildAsarBuffer,
  verifyAsarBuffer,
} from '../src/asar-codec.mjs';
import { DEFAULT_APP_PATH, inspectMacApp } from '../src/macos-app.mjs';

function buildFixtureAsar(fileEntries) {
  const header = { files: {} };
  const chunks = [];
  let offset = 0;

  for (const [relativePath, content] of Object.entries(fileEntries)) {
    const buf = Buffer.from(content, 'utf8');
    const parts = relativePath.split('/');
    let cursor = header;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor.files[parts[i]] ??= { files: {} };
      cursor = cursor.files[parts[i]];
    }
    cursor.files[parts.at(-1)] = {
      size: buf.length,
      offset: String(offset),
      integrity: computeFileIntegrity(buf),
    };
    chunks.push(buf);
    offset += buf.length;
  }

  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const alignedLen = (headerJson.length + 3) & ~3;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(alignedLen + 8, 4);
  prefix.writeUInt32LE(alignedLen + 4, 8);
  prefix.writeUInt32LE(headerJson.length, 12);

  return Buffer.concat([prefix, headerJson, Buffer.alloc(alignedLen - headerJson.length, 0), ...chunks]);
}

test('ASAR 解析、增量替换与完整性哈希校验往返一致', () => {
  const fixture = buildFixtureAsar({
    'package.json': '{"name":"fixture","version":"1.0.0"}',
    'dist/preload.js': 'console.log("orig preload");\n',
    'dist/utils.js': 'exports.color = "#131313";\n',
  });

  const parsed = parseAsarBuffer(fixture);
  assert.equal(readAsarEntryUtf8(parsed, 'dist/preload.js'), 'console.log("orig preload");\n');
  assert.equal(verifyAsarBuffer(fixture, parsed.headerSha256).verifiedFileCount, 3);

  const rebuilt = rebuildAsarBuffer(
    parsed,
    new Map([['dist/preload.js', Buffer.from('console.log("patched preload with longer text");\n', 'utf8')]])
  );

  const verified = verifyAsarBuffer(rebuilt.buffer, rebuilt.headerSha256);
  assert.equal(verified.verifiedFileCount, 3);

  const reparsed = parseAsarBuffer(rebuilt.buffer);
  assert.equal(
    readAsarEntryUtf8(reparsed, 'dist/preload.js'),
    'console.log("patched preload with longer text");\n'
  );
  // 未修改文件必须字节完全不变
  assert.equal(readAsarEntryUtf8(reparsed, 'dist/utils.js'), 'exports.color = "#131313";\n');
  assert.equal(readAsarEntryUtf8(reparsed, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
});

test('覆盖不存在的 ASAR 条目必须立即报错 (Fail Fast)', () => {
  const fixture = buildFixtureAsar({ 'dist/preload.js': 'ok\n' });
  const parsed = parseAsarBuffer(fixture);

  assert.throws(
    () => rebuildAsarBuffer(parsed, new Map([['dist/nonexistent.js', Buffer.from('x')]])),
    /Cannot override missing ASAR entry/
  );
});

test('篡改 ASAR 载荷字节后校验必须失败', () => {
  const fixture = buildFixtureAsar({ 'dist/preload.js': 'hello world\n' });
  const parsed = parseAsarBuffer(fixture);
  const corrupted = Buffer.from(fixture);
  corrupted[parsed.dataOffset] ^= 0xff;

  assert.throws(() => verifyAsarBuffer(corrupted, parsed.headerSha256), /integrity mismatch/);
});

test('若本机存在 Antigravity.app，Header SHA-256 应与 Info.plist 完全吻合（只读）', {
  skip: process.platform !== 'darwin' || !fs.existsSync(DEFAULT_APP_PATH),
}, () => {
  const appInfo = inspectMacApp(DEFAULT_APP_PATH);
  const archive = readAsarArchive(appInfo.asarPath);
  if (appInfo.plistAsarHash) {
    assert.equal(archive.headerSha256, appInfo.plistAsarHash);
  }
  const verified = verifyAsarBuffer(archive.buffer, appInfo.plistAsarHash ?? undefined);
  assert.ok(verified.verifiedFileCount > 10);
});
