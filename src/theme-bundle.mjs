import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '..');
const STUDIO_THEME_DIR = path.join(REPO_ROOT, 'themes', 'studio');
const CSS_PLACEHOLDER = '__AT_THEME_CSS__';
const PRESET_PLACEHOLDER = '__AT_THEME_PRESET__';
const BACKDROP_PLACEHOLDER = '__AT_THEME_BACKDROP__';

export const THEME_NAME = 'studio';
export const THEME_VERSION = '1.0.1';
export const DEFAULT_PRESET = 'iris';
export const DEFAULT_BACKDROP = 'starlight';

export const THEME_PRESETS = Object.freeze([
  Object.freeze({
    id: 'iris',
    label: 'Iris',
    description: '纯白紫雾 / 暗夜曜紫（默认）',
    nativeColors: Object.freeze({
      lightBg: '#ffffff',
      darkBg: '#111018',
      lightFg: '#141224',
      darkFg: '#f6f5fc',
      lightSub: '#65607c',
      darkSub: '#8f8aa8',
    }),
  }),
  Object.freeze({
    id: 'slate',
    label: 'Slate',
    description: '冷岩极客 / 深海暗蓝',
    nativeColors: Object.freeze({
      lightBg: '#ffffff',
      darkBg: '#0f172a',
      lightFg: '#0f172a',
      darkFg: '#f8fafc',
      lightSub: '#58667a',
      darkSub: '#94a3b8',
    }),
  }),
  Object.freeze({
    id: 'mono',
    label: 'Mono',
    description: '画廊纯白 / OLED 纯黑',
    nativeColors: Object.freeze({
      lightBg: '#ffffff',
      darkBg: '#0f0f11',
      lightFg: '#111113',
      darkFg: '#fafafa',
      lightSub: '#666670',
      darkSub: '#8e8e98',
    }),
  }),
  Object.freeze({
    id: 'stone',
    label: 'Stone',
    description: '清透暖石 / 浓缩炭黑',
    nativeColors: Object.freeze({
      lightBg: '#fdfcfa',
      darkBg: '#181614',
      lightFg: '#1c1917',
      darkFg: '#f5f3ee',
      lightSub: '#6b655e',
      darkSub: '#989288',
    }),
  }),
  Object.freeze({
    id: 'emerald',
    label: 'Emerald',
    description: '清冽雾青 / 深松黑曜',
    nativeColors: Object.freeze({
      lightBg: '#ffffff',
      darkBg: '#0f1716',
      lightFg: '#0f1f1c',
      darkFg: '#f0f7f5',
      lightSub: '#586e68',
      darkSub: '#88a09a',
    }),
  }),
  Object.freeze({
    id: 'midnight',
    label: 'Midnight',
    description: '冰白靛蓝 / 深空蓝黑',
    nativeColors: Object.freeze({
      lightBg: '#ffffff',
      darkBg: '#0e111b',
      lightFg: '#11162b',
      darkFg: '#f5f7ff',
      lightSub: '#5d6687',
      darkSub: '#8d96b8',
    }),
  }),
]);

export const SUPPORTED_PRESETS = Object.freeze(THEME_PRESETS.map((item) => item.id));
export const SUPPORTED_BACKDROPS = Object.freeze(['starlight', 'blueprint', 'none']);

const PRESET_BY_ID = new Map(THEME_PRESETS.map((item) => [item.id, item]));

/**
 * 校验并返回受支持的预设名（非法预设立即 Fail Fast）
 */
export function resolveThemePreset(preset = DEFAULT_PRESET) {
  const normalized = String(preset || DEFAULT_PRESET).trim().toLowerCase();
  if (!PRESET_BY_ID.has(normalized)) {
    throw new Error(
      `Unsupported theme preset "${preset}". Expected one of: ${SUPPORTED_PRESETS.join(', ')}`
    );
  }
  return normalized;
}

/**
 * 校验并返回受支持的顶栏艺术纹理模式
 */
export function resolveStageBackdrop(backdrop = DEFAULT_BACKDROP) {
  const normalized = String(backdrop || DEFAULT_BACKDROP).trim().toLowerCase();
  if (!SUPPORTED_BACKDROPS.includes(normalized)) {
    throw new Error(
      `Unsupported stage backdrop "${backdrop}". Expected one of: ${SUPPORTED_BACKDROPS.join(', ')}`
    );
  }
  return normalized;
}

/**
 * 获取指定预设对应的原生 Electron 窗口底色与前景色
 */
export function getPresetNativeColors(preset = DEFAULT_PRESET) {
  const resolved = resolveThemePreset(preset);
  return PRESET_BY_ID.get(resolved).nativeColors;
}

/**
 * 读取皮肤 CSS 源文件并拼装为完整样式表
 */
export function loadThemeStylesheet() {
  const tokensPath = path.join(STUDIO_THEME_DIR, 'tokens.css');
  const layoutPath = path.join(STUDIO_THEME_DIR, 'layout.css');

  const tokensCss = fs.readFileSync(tokensPath, 'utf8').trim();
  const layoutCss = fs.readFileSync(layoutPath, 'utf8').trim();
  if (!tokensCss || !layoutCss) {
    throw new Error(`Empty theme stylesheet in "${STUDIO_THEME_DIR}"`);
  }

  return `${tokensCss}\n\n${layoutCss}\n`;
}

/**
 * 构建可独立执行的渲染进程主题注入脚本（包含全部 6 套双色主题与内置实时切换器）
 */
export function buildThemeRuntimeScript(preset = DEFAULT_PRESET, backdrop = DEFAULT_BACKDROP) {
  const resolvedPreset = resolveThemePreset(preset);
  const resolvedBackdrop = resolveStageBackdrop(backdrop);
  const runtimePath = path.join(STUDIO_THEME_DIR, 'runtime.js');
  const runtimeTemplate = fs.readFileSync(runtimePath, 'utf8');

  for (const placeholder of [CSS_PLACEHOLDER, PRESET_PLACEHOLDER, BACKDROP_PLACEHOLDER]) {
    const count = runtimeTemplate.split(placeholder).length - 1;
    if (count !== 1) {
      throw new Error(
        `Theme runtime template must contain "${placeholder}" exactly once, found ${count} in ${runtimePath}`
      );
    }
  }

  const combinedCss = loadThemeStylesheet();
  return runtimeTemplate
    .replace(PRESET_PLACEHOLDER, () => JSON.stringify(resolvedPreset))
    .replace(BACKDROP_PLACEHOLDER, () => JSON.stringify(resolvedBackdrop))
    .replace(CSS_PLACEHOLDER, () => JSON.stringify(combinedCss))
    .trim();
}
