import crypto from 'node:crypto';
import fs from 'node:fs';

// Electron ASAR 规范使用 4MB 分块计算每个文件的 SHA-256 完整性校验值
export const ASAR_BLOCK_SIZE = 4 * 1024 * 1024;

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 计算单个文件在 ASAR Header 中使用的完整性校验元数据（与 @electron/asar 一致：
 * 按 blockSize 切块，整数倍时不补空块，空文件只有一个空数据哈希）
 * @param {Buffer} fileBuffer
 * @param {number} blockSize
 */
export function computeFileIntegrity(fileBuffer, blockSize = ASAR_BLOCK_SIZE) {
  const hash = sha256Hex(fileBuffer);
  const blocks = [];
  if (fileBuffer.length === 0) {
    blocks.push(hash);
  } else {
    for (let offset = 0; offset < fileBuffer.length; offset += blockSize) {
      const slice = fileBuffer.subarray(offset, Math.min(offset + blockSize, fileBuffer.length));
      blocks.push(sha256Hex(slice));
    }
  }
  return {
    algorithm: 'SHA256',
    hash,
    blockSize,
    blocks,
  };
}

function verifyFileIntegrity(content, integrity, entryPath) {
  const { algorithm, hash, blockSize, blocks } = integrity;
  if (algorithm !== 'SHA256') {
    throw new Error(`Unsupported ASAR integrity algorithm at "${entryPath}": ${algorithm}`);
  }
  if (!Number.isInteger(blockSize) || blockSize <= 0 || !Array.isArray(blocks)) {
    throw new Error(
      `Malformed ASAR integrity metadata at "${entryPath}": blockSize=${blockSize}, blocks=${Array.isArray(blocks) ? `${blocks.length} entries` : typeof blocks}`
    );
  }
  const actual = computeFileIntegrity(content, blockSize);
  if (actual.hash !== hash) {
    throw new Error(`ASAR file integrity mismatch at "${entryPath}": expected=${hash}, actual=${actual.hash}`);
  }
  if (actual.blocks.length !== blocks.length) {
    throw new Error(
      `ASAR block count mismatch at "${entryPath}": expected=${blocks.length}, actual=${actual.blocks.length} (blockSize=${blockSize})`
    );
  }
  const mismatchIndex = actual.blocks.findIndex((blockHash, index) => blockHash !== blocks[index]);
  if (mismatchIndex !== -1) {
    throw new Error(
      `ASAR block integrity mismatch at "${entryPath}" block #${mismatchIndex}: expected=${blocks[mismatchIndex]}, actual=${actual.blocks[mismatchIndex]}`
    );
  }
}

/**
 * 解析内存中的 ASAR 二进制归档
 * @param {Buffer} archiveBuffer
 */
export function parseAsarBuffer(archiveBuffer) {
  if (!Buffer.isBuffer(archiveBuffer) || archiveBuffer.length < 16) {
    throw new Error(`Invalid ASAR buffer: expected at least 16 bytes, got ${archiveBuffer?.length ?? 0}`);
  }

  const sizePicklePayloadLen = archiveBuffer.readUInt32LE(0);
  const headerPickleTotalLen = archiveBuffer.readUInt32LE(4);
  const headerPicklePayloadLen = archiveBuffer.readUInt32LE(8);
  const headerJsonByteLen = archiveBuffer.readUInt32LE(12);

  if (sizePicklePayloadLen !== 4) {
    throw new Error(`Invalid ASAR pickle header: expected u0=4, got ${sizePicklePayloadLen}`);
  }
  if (headerPickleTotalLen !== headerPicklePayloadLen + 4) {
    throw new Error(
      `Invalid ASAR pickle lengths: headerTotal=${headerPickleTotalLen}, headerPayload=${headerPicklePayloadLen}`
    );
  }

  const dataOffset = 8 + headerPickleTotalLen;
  if (16 + headerJsonByteLen > dataOffset || dataOffset > archiveBuffer.length) {
    throw new Error(
      `Corrupted ASAR bounds: jsonLen=${headerJsonByteLen}, dataOffset=${dataOffset}, archiveLen=${archiveBuffer.length}`
    );
  }

  const headerJsonRaw = archiveBuffer.subarray(16, 16 + headerJsonByteLen);
  const headerSha256 = sha256Hex(headerJsonRaw);

  let header;
  try {
    header = JSON.parse(headerJsonRaw.toString('utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ASAR header JSON: ${err.message}`);
  }

  if (!header || typeof header !== 'object' || !header.files) {
    throw new Error('Invalid ASAR header JSON: missing root "files" object');
  }

  return {
    buffer: archiveBuffer,
    header,
    dataOffset,
    headerJsonRaw,
    headerSha256,
  };
}

/**
 * 从磁盘读取并解析 ASAR 文件
 * @param {string} asarPath
 */
export function readAsarArchive(asarPath) {
  const archiveBuffer = fs.readFileSync(asarPath);
  return parseAsarBuffer(archiveBuffer);
}

function findEntryNode(header, entryPath) {
  const normalized = entryPath.replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  let current = header;
  for (const segment of segments) {
    if (!current.files || !(segment in current.files)) {
      return null;
    }
    current = current.files[segment];
  }
  return current;
}

/**
 * 提取 ASAR 中指定路径的文件 Buffer
 */
export function readAsarEntryBuffer(archive, entryPath) {
  const node = findEntryNode(archive.header, entryPath);
  if (!node) {
    throw new Error(`ASAR entry not found: "${entryPath}"`);
  }
  if (node.files) {
    throw new Error(`ASAR entry is a directory, not a file: "${entryPath}"`);
  }
  if (node.unpacked) {
    throw new Error(`ASAR entry is unpacked and not stored inline: "${entryPath}"`);
  }
  if (node.offset === undefined || node.size === undefined) {
    throw new Error(`ASAR entry missing offset/size metadata: "${entryPath}"`);
  }

  const start = archive.dataOffset + Number(node.offset);
  const end = start + node.size;
  if (start < archive.dataOffset || end > archive.buffer.length) {
    throw new Error(`ASAR entry out of bounds: "${entryPath}" (${start}..${end} > ${archive.buffer.length})`);
  }
  return archive.buffer.subarray(start, end);
}

/**
 * 提取 ASAR 中指定路径的 UTF-8 文本
 */
export function readAsarEntryUtf8(archive, entryPath) {
  return readAsarEntryBuffer(archive, entryPath).toString('utf8');
}

/**
 * 检查 ASAR 中是否存在某个条目
 */
export function hasAsarEntry(archive, entryPath) {
  return findEntryNode(archive.header, entryPath) !== null;
}

/**
 * 校验 ASAR 头部哈希与全部内联文件的分块 SHA-256 完整性
 * @param {Buffer} archiveBuffer
 * @param {string | undefined} expectedHeaderSha256
 */
export function verifyAsarBuffer(archiveBuffer, expectedHeaderSha256) {
  const archive = parseAsarBuffer(archiveBuffer);
  if (expectedHeaderSha256 && archive.headerSha256 !== expectedHeaderSha256) {
    throw new Error(
      `ASAR header SHA-256 mismatch: expected=${expectedHeaderSha256}, actual=${archive.headerSha256}`
    );
  }

  let verifiedFileCount = 0;
  function walkNode(node, currentPath) {
    if (node.files) {
      for (const [name, child] of Object.entries(node.files)) {
        walkNode(child, currentPath ? `${currentPath}/${name}` : name);
      }
      return;
    }
    if (node.unpacked || node.link !== undefined) {
      return;
    }
    const content = readAsarEntryBuffer(archive, currentPath);
    if (node.integrity) {
      verifyFileIntegrity(content, node.integrity, currentPath);
      verifiedFileCount += 1;
    }
  }

  walkNode(archive.header, '');
  return {
    headerSha256: archive.headerSha256,
    verifiedFileCount,
  };
}

/**
 * 基于已有 ASAR 归档，仅替换 overridesMap 中指定路径的文件并重新打包。
 * 所有未修改文件均按原字节直通复制，确保无损且高效。
 * @param {ReturnType<typeof parseAsarBuffer>} archive
 * @param {Map<string, Buffer>} overridesMap
 */
export function rebuildAsarBuffer(archive, overridesMap) {
  if (!(overridesMap instanceof Map)) {
    throw new Error('overridesMap must be a Map<string, Buffer>');
  }

  const matchedOverrides = new Set();
  const payloadChunks = [];
  let runningOffset = 0;

  function cloneTree(node, currentPath) {
    if (node.files) {
      const nextFiles = {};
      for (const [name, child] of Object.entries(node.files)) {
        const childPath = currentPath ? `${currentPath}/${name}` : name;
        nextFiles[name] = cloneTree(child, childPath);
      }
      const dirMeta = { files: nextFiles };
      if (node.unpacked !== undefined) {
        dirMeta.unpacked = node.unpacked;
      }
      return dirMeta;
    }

    if (node.unpacked || node.link !== undefined) {
      return { ...node };
    }

    let fileBuffer;
    let integrity;
    if (overridesMap.has(currentPath)) {
      fileBuffer = overridesMap.get(currentPath);
      if (!Buffer.isBuffer(fileBuffer)) {
        throw new Error(`Override content for "${currentPath}" must be a Buffer`);
      }
      matchedOverrides.add(currentPath);
      integrity = computeFileIntegrity(fileBuffer);
    } else {
      fileBuffer = readAsarEntryBuffer(archive, currentPath);
      integrity = node.integrity ? { ...node.integrity, blocks: [...node.integrity.blocks] } : computeFileIntegrity(fileBuffer);
    }

    const nextEntry = {
      size: fileBuffer.length,
      offset: String(runningOffset),
      integrity,
    };
    if (node.executable !== undefined) {
      nextEntry.executable = node.executable;
    }

    payloadChunks.push(fileBuffer);
    runningOffset += fileBuffer.length;
    return nextEntry;
  }

  const nextHeader = cloneTree(archive.header, '');

  for (const targetPath of overridesMap.keys()) {
    if (!matchedOverrides.has(targetPath)) {
      throw new Error(`Cannot override missing ASAR entry: "${targetPath}"`);
    }
  }

  const headerJsonRaw = Buffer.from(JSON.stringify(nextHeader), 'utf8');
  const headerSha256 = sha256Hex(headerJsonRaw);
  const alignedJsonLen = (headerJsonRaw.length + 3) & ~3;
  const paddingLen = alignedJsonLen - headerJsonRaw.length;

  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(alignedJsonLen + 8, 4);
  prefix.writeUInt32LE(alignedJsonLen + 4, 8);
  prefix.writeUInt32LE(headerJsonRaw.length, 12);

  const padding = paddingLen > 0 ? Buffer.alloc(paddingLen, 0) : Buffer.alloc(0);
  const rebuiltBuffer = Buffer.concat([prefix, headerJsonRaw, padding, ...payloadChunks]);

  return {
    buffer: rebuiltBuffer,
    header: nextHeader,
    headerSha256,
  };
}
