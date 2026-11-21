import assert from 'node:assert/strict';
import test from 'node:test';
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
  SUPPORTED_PRESETS,
  buildThemeRuntimeScript,
  loadThemeStylesheet,
  resolveStageBackdrop,
  resolveThemePreset,
} from '../src/theme-bundle.mjs';

const EXPECTED_PRESETS = ['iris', 'slate', 'mono', 'stone', 'emerald', 'midnight'];

const SAMPLE_PRELOAD_WITH_ZH = `"use strict";
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("host", {});
/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */
(() => { globalThis.__zhLoaded = true; })();
/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */
`;

const SAMPLE_UTILS_WITH_ZH = `"use strict";
function getHubCurtainColor() {
    return getThemeMode().toUpperCase().includes('LIGHT') ? '#FAFAFA' : '#131313';
}
function createWindow() {
    const backgroundColor = isLight ? '#FAFAFA' : '#131313';
    const foregroundColor = isLight ? '#383A42' : '#FAFAFA';
    /* --- SIDECAR TRANSLATION START --- */
    const keepZh = true;
    /* --- SIDECAR TRANSLATION END --- */
    hubContents.on('will-navigate', guardExternalNavigation);
}
`;

const SAMPLE_SPLASH = `"use strict";
function createProvisionSplash() {
    const bg = dark ? '#131313' : '#FAFAFA';
    const fg = dark ? '#FAFAFA' : '#383A42';
    const sub = dark ? '#9A9A9A' : '#6B6E76';
}
`;

function hexLuminance(hex) {
  const clean = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const v = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(hexA, hexB) {
  const l1 = hexLuminance(hexA);
  const l2 = hexLuminance(hexB);
  const [bright, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (bright + 0.05) / (dark + 0.05);
}

function extractCssVar(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `Missing hex variable ${name} in CSS block`);
  return match[1];
}

test('CSS 包含全部 6 套双色主题、4 级墨阶、半透明状态层与浏览器镂空保护', () => {
  const css = loadThemeStylesheet();
  for (const preset of EXPECTED_PRESETS) {
    assert.ok(css.includes(`data-at-preset="${preset}"`), `Missing preset "${preset}" in CSS`);
  }
  assert.match(css, /--secondary-foreground:\s*var\(--at-text-secondary\)/);
  assert.match(css, /--placeholder:\s*var\(--at-placeholder\)/);
  assert.match(css, /--glass-highlight:\s*var\(--at-specular\)/);
  assert.match(css, /--onyx-raised:\s*var\(--at-surface\)/);
  assert.match(css, /--at-layer-subtle:\s*rgb\(/);
  assert.match(css, /--editor-diff-inserted-line-background/);
  assert.match(css, /data-at-density="comfortable"/);
  assert.match(css, /\.at-no-transitions/);
  assert.match(css, /\.at-stage-backdrop/);
  assert.match(css, /\[data-side-panel-strip\]/);
  assert.match(css, /\[data-testid="bottom-terminal-panel"\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /data-has-browser-hole="true"/);
});

test('全部 12 套深浅配色的 4 级文字层级严格满足 WCAG 对比度与层次递减', () => {
  const css = loadThemeStylesheet();
  for (const preset of EXPECTED_PRESETS) {
    for (const mode of ['light', 'dark']) {
      const selector =
        mode === 'light'
          ? `html[data-at-skin="studio"][data-at-preset="${preset}"] {`
          : `html[data-at-skin="studio"][data-at-preset="${preset}"][data-at-mode="dark"] {`;
      const startIdx = css.indexOf(selector);
      assert.notEqual(startIdx, -1, `Missing selector for ${preset}/${mode}`);
      const endIdx = css.indexOf('}', startIdx);
      const block = css.slice(startIdx, endIdx);

      const canvas = extractCssVar(block, '--at-canvas');
      const text = extractCssVar(block, '--at-text');
      const secondary = extractCssVar(block, '--at-text-secondary');
      const muted = extractCssVar(block, '--at-text-muted');
      const placeholder = extractCssVar(block, '--at-placeholder');
      const sidebar = extractCssVar(block, '--at-sidebar');
      const sidebarFg = extractCssVar(block, '--at-sidebar-fg');
      const sidebarMuted = extractCssVar(block, '--at-sidebar-muted');

      const cPrimary = contrastRatio(canvas, text);
      const cSecondary = contrastRatio(canvas, secondary);
      const cMuted = contrastRatio(canvas, muted);
      const cPlaceholder = contrastRatio(canvas, placeholder);

      assert.ok(cPrimary >= 12, `${preset}/${mode} primary contrast too low: ${cPrimary.toFixed(2)}`);
      assert.ok(cSecondary >= 7, `${preset}/${mode} secondary contrast too low: ${cSecondary.toFixed(2)}`);
      assert.ok(cMuted >= 4.5, `${preset}/${mode} muted contrast too low: ${cMuted.toFixed(2)}`);
      assert.ok(
        cPrimary > cSecondary && cSecondary > cMuted && cMuted > cPlaceholder,
        `${preset}/${mode} 4-tier ink hierarchy not monotonic`
      );
      assert.ok(
        contrastRatio(sidebar, sidebarFg) >= 10,
        `${preset}/${mode} sidebar primary contrast too low`
      );
      assert.ok(
        contrastRatio(sidebar, sidebarMuted) >= 4.5,
        `${preset}/${mode} sidebar muted contrast too low`
      );
      assert.ok(block.includes('--syntax-keyword:'), `${preset}/${mode} missing syntax palette`);
    }
  }
});

test('预设与顶栏纹理校验：支持全部 6 套主题与 3 种顶栏模式，非法值 Fail Fast', () => {
  assert.equal(DEFAULT_PRESET, 'iris');
  assert.equal(DEFAULT_BACKDROP, 'starlight');
  assert.deepEqual([...SUPPORTED_PRESETS], EXPECTED_PRESETS);
  for (const preset of SUPPORTED_PRESETS) {
    assert.equal(resolveThemePreset(preset), preset);
  }
  for (const mode of ['starlight', 'blueprint', 'none']) {
    assert.equal(resolveStageBackdrop(mode), mode);
  }
  assert.throws(() => resolveThemePreset('unknown-theme'), /Unsupported theme preset/);
  assert.throws(() => resolveStageBackdrop('rainbow'), /Unsupported stage backdrop/);
});

test('渲染层 runtime 支持 preload 延迟挂载、明暗模式覆盖同步、星空 SVG 与切换器渲染', () => {
  const runtimeScript = buildThemeRuntimeScript('iris', 'starlight');
  assert.doesNotMatch(runtimeScript, /__AT_THEME_CSS__/);
  assert.doesNotMatch(runtimeScript, /__AT_THEME_PRESET__/);
  assert.doesNotMatch(runtimeScript, /__AT_THEME_BACKDROP__/);
  assert.doesNotThrow(() => new Function(runtimeScript));

  const docListeners = new Map();
  const winListeners = new Map();
  const rootAttrs = new Map();
  const rootStyleProps = new Map();
  const headChildren = [];
  const bodyChildren = [];
  const sidebarChildren = [];
  const storageMap = new Map([
    ['antigravity-themes:preset', 'emerald'],
    ['antigravity-themes:density', 'comfortable'],
    ['antigravity-themes:mode', 'light'],
  ]);

  function makeElement(tag) {
    const elAttrs = new Map();
    const elListeners = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      innerHTML: '',
      parentNode: null,
      children: [],
      getAttribute: (k) => elAttrs.get(k) ?? null,
      setAttribute: (k, v) => elAttrs.set(k, String(v)),
      addEventListener: (k, fn) => elListeners.set(k, fn),
      appendChild(child) {
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      querySelectorAll: () => [],
    };
    return el;
  }

  const fakeHead = {
    get lastElementChild() {
      return headChildren.at(-1) ?? null;
    },
    appendChild(el) {
      const idx = headChildren.indexOf(el);
      if (idx !== -1) headChildren.splice(idx, 1);
      el.parentNode = fakeHead;
      headChildren.push(el);
      return el;
    },
  };

  const fakeRoot = {
    classList: { contains: () => false },
    dataset: {},
    style: { setProperty: (k, v) => rootStyleProps.set(k, v) },
    getAttribute: (k) => rootAttrs.get(k) ?? null,
    setAttribute: (k, v) => rootAttrs.set(k, String(v)),
    appendChild: (el) => fakeHead.appendChild(el),
  };

  const fakeSidebarPane = {
    getBoundingClientRect: () => ({ width: 268 }),
    querySelector: (sel) =>
      sel.includes('at-stage-backdrop')
        ? sidebarChildren.find((c) => c.className === 'at-stage-backdrop') ?? null
        : null,
    appendChild(el) {
      el.parentNode = fakeSidebarPane;
      sidebarChildren.push(el);
      return el;
    },
  };

  const fakeDocument = {
    documentElement: null,
    head: null,
    body: null,
    addEventListener: (name, fn) => docListeners.set(name, fn),
    getElementById: (id) =>
      headChildren.find((el) => el.id === id) ?? bodyChildren.find((el) => el.id === id) ?? null,
    querySelector: (sel) => (sel.includes('sidebar-split') ? fakeSidebarPane : null),
    createElement: makeElement,
  };

  const fakeWindow = {
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v)),
    },
    addEventListener: (name, fn) => winListeners.set(name, fn),
  };

  const runner = new Function('document', 'window', 'setTimeout', runtimeScript);
  runner(fakeDocument, fakeWindow, () => 0);

  const bodyClassSet = new Set(['dark', 'theme-dark']);
  fakeDocument.documentElement = fakeRoot;
  fakeDocument.head = fakeHead;
  fakeDocument.body = {
    classList: {
      contains: (c) => bodyClassSet.has(c),
      toggle: (c, force) => {
        if (force) bodyClassSet.add(c);
        else bodyClassSet.delete(c);
      },
    },
    appendChild(el) {
      el.parentNode = fakeDocument.body;
      bodyChildren.push(el);
      return el;
    },
  };

  docListeners.get('DOMContentLoaded')();

  assert.equal(rootAttrs.get('data-at-skin'), 'studio');
  assert.equal(rootAttrs.get('data-at-preset'), 'emerald');
  assert.equal(rootAttrs.get('data-at-backdrop'), 'starlight');
  assert.equal(rootAttrs.get('data-at-density'), 'comfortable');
  assert.equal(rootAttrs.get('data-at-mode'), 'light');
  assert.equal(bodyClassSet.has('theme-light'), true);
  assert.equal(bodyClassSet.has('dark'), false);
  assert.equal(rootAttrs.get('data-at-sidebar-open'), 'true');
  assert.equal(rootStyleProps.get('--at-sidebar-width'), '268px');
  assert.equal(sidebarChildren.length, 1);
  assert.ok(sidebarChildren[0].innerHTML.includes('data-stage-art="starlight"'));
  assert.ok(bodyChildren.some((el) => el.id === 'at-theme-switcher-fab'));
  const pickerBackdrop = bodyChildren.find((el) => el.id === 'at-theme-picker-backdrop');
  assert.ok(pickerBackdrop);
  const pickerDialog = pickerBackdrop.children.find((el) => el.id === 'at-theme-picker-dialog');
  assert.ok(pickerDialog);
  assert.equal(pickerDialog.getAttribute('aria-modal'), 'true');
  assert.ok(pickerDialog.innerHTML.includes('at-picker-wire'));
  assert.ok(pickerDialog.innerHTML.includes('data-mode-id="light"'));
  assert.ok(pickerDialog.innerHTML.includes('data-mode-id="dark"'));
  assert.ok(pickerDialog.innerHTML.includes('data-mode-id="auto"'));
  assert.ok(pickerDialog.innerHTML.includes('data-preset-id="slate"'));
  assert.ok(pickerDialog.innerHTML.includes('data-density-id="comfortable"'));
});

test('preload 与 utils/splash 支持任意预设幂等切换、共存汉化且卸载字节级还原', () => {
  const patchedSlate = patchPreloadSource(SAMPLE_PRELOAD_WITH_ZH, 'slate', 'blueprint');
  const patchedTwice = patchPreloadSource(patchedSlate, 'slate', 'blueprint');
  assert.equal(patchedSlate, patchedTwice);
  assert.ok(patchedSlate.includes('/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */'));
  assert.doesNotThrow(() => new Function(patchedSlate));
  assert.equal(stripPreloadSource(patchedSlate), SAMPLE_PRELOAD_WITH_ZH);

  const utilsOnce = patchUtilsSource(SAMPLE_UTILS_WITH_ZH, 'slate');
  assert.equal(utilsOnce.sidecarInjected, true);
  assert.deepEqual(utilsOnce.appliedColors, ['curtain-fallback', 'window-background', 'window-foreground']);
  assert.ok(utilsOnce.content.includes('#0f172a'));
  assert.doesNotThrow(() => new Function(utilsOnce.content));
  assert.equal(stripUtilsSource(utilsOnce.content), SAMPLE_UTILS_WITH_ZH);

  const splashOnce = patchSplashSource(SAMPLE_SPLASH, 'slate');
  assert.equal(stripSplashSource(splashOnce.content), SAMPLE_SPLASH);

  const state = inspectPatchState({
    preloadSource: patchedSlate,
    utilsSource: utilsOnce.content,
    splashSource: splashOnce.content,
  });
  assert.equal(state.installed, true);
  assert.equal(state.themeId, 'studio');
  assert.equal(state.themePreset, 'slate');
  assert.equal(state.stageBackdrop, 'blueprint');
  assert.equal(state.themeVersion, '1.0.0');
  assert.equal(state.hasChineseLocalization, true);
});
