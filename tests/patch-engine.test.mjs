import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  THEME_PRESETS,
  THEME_VERSION,
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
  return match[1].toLowerCase();
}

function extractPresetBlock(css, preset, mode) {
  const selector =
    mode === 'light'
      ? `html[data-at-skin="studio"][data-at-preset="${preset}"] {`
      : `html[data-at-skin="studio"][data-at-preset="${preset}"][data-at-mode="dark"] {`;
  const startIdx = css.indexOf(selector);
  assert.notEqual(startIdx, -1, `Missing selector for ${preset}/${mode}`);
  return css.slice(startIdx, css.indexOf('}', startIdx));
}

// runtime.js 里切换器预览卡用的配色表（纯对象字面量，可直接求值）
function readRuntimeThemeCatalog() {
  const runtimeSource = fs.readFileSync(new URL('../themes/studio/runtime.js', import.meta.url), 'utf8');
  const match = runtimeSource.match(/const THEME_CATALOG = (\[[\s\S]*?\n {2}\]);/);
  assert.ok(match, 'THEME_CATALOG literal not found in themes/studio/runtime.js');
  return new Function(`return ${match[1]};`)();
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
      const block = extractPresetBlock(css, preset, mode);

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

test('三处配色定义保持一致：tokens.css、切换器预览色（runtime.js）、原生窗口底色（theme-bundle）', () => {
  const css = loadThemeStylesheet();
  const catalog = readRuntimeThemeCatalog();
  assert.deepEqual(
    catalog.map((theme) => theme.id),
    EXPECTED_PRESETS
  );

  for (const preset of THEME_PRESETS) {
    const preview = catalog.find((theme) => theme.id === preset.id);
    const native = preset.nativeColors;
    for (const mode of ['light', 'dark']) {
      const block = extractPresetBlock(css, preset.id, mode);
      const isLight = mode === 'light';
      const expectations = [
        ['原生底色', isLight ? native.lightBg : native.darkBg, '--at-canvas'],
        ['原生前景', isLight ? native.lightFg : native.darkFg, '--at-text'],
        ['原生副文字', isLight ? native.lightSub : native.darkSub, '--at-text-muted'],
        ['预览 canvas', preview[mode].canvas, '--at-canvas'],
        ['预览 sidebar', preview[mode].sidebar, '--at-sidebar'],
        ['预览 composer', preview[mode].composer, '--at-composer-bg'],
        ['预览 accent', preview[mode].accent, '--at-accent'],
      ];
      for (const [label, actual, cssVar] of expectations) {
        assert.equal(
          actual.toLowerCase(),
          extractCssVar(block, cssVar),
          `${preset.id}/${mode} ${label} 与 tokens.css 的 ${cssVar} 不一致`
        );
      }
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
  const bodyStyleProps = new Map();
  const settingsContainerAttrs = new Map();
  const fakeSettingsButton = {
    parentElement: {
      hasAttribute: (k) => settingsContainerAttrs.has(k),
      setAttribute: (k, v) => settingsContainerAttrs.set(k, String(v)),
    },
  };
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

  const fakeSidebarNav = {
    querySelector: (sel) =>
      sel.includes('at-stage-backdrop')
        ? sidebarChildren.find((c) => c.className === 'at-stage-backdrop') ?? null
        : null,
    appendChild(el) {
      el.parentNode = fakeSidebarNav;
      sidebarChildren.push(el);
      return el;
    },
    removeChild(el) {
      const idx = sidebarChildren.indexOf(el);
      if (idx !== -1) sidebarChildren.splice(idx, 1);
      el.parentNode = null;
    },
  };

  const fakeSidebarPane = {
    getBoundingClientRect: () => ({ width: 268 }),
    querySelector: () => null,
    appendChild() {
      throw new Error('Stage backdrop should mount into Sidebar navigation container, not split wrapper');
    },
  };

  const fakeDocument = {
    documentElement: null,
    head: null,
    body: null,
    addEventListener: (name, fn) => docListeners.set(name, fn),
    getElementById: (id) =>
      headChildren.find((el) => el.id === id) ?? bodyChildren.find((el) => el.id === id) ?? null,
    querySelector: (sel) => {
      if (sel.includes('[role="navigation"]')) return fakeSidebarNav;
      if (sel.includes('sidebar-split')) return fakeSidebarPane;
      return null;
    },
    querySelectorAll: (sel) => (sel === '[data-testid="settings-button"]' ? [fakeSettingsButton] : []),
    createElement: makeElement,
  };

  const fakeWindow = {
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v)),
    },
    addEventListener: (name, fn) => winListeners.set(name, fn),
  };
  fakeWindow.parent = fakeWindow;

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
    style: { setProperty: (k, v) => bodyStyleProps.set(k, v) },
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
  assert.equal(bodyStyleProps.get('--at-sidebar-width'), '268px');
  assert.equal(rootStyleProps.has('--at-sidebar-width'), false, '写在 <html> style 上会触发 attrObserver，拖动侧栏时每帧重跑 boot');
  assert.equal(settingsContainerAttrs.get('data-at-sidebar-footer'), '', '设置按钮的父容器应被打上底栏标记');
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

  const pressOptionCommand = (code, key) => {
    let prevented = false;
    winListeners.get('keydown')({
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      code,
      key,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {},
    });
    return prevented;
  };
  assert.equal(pressOptionCommand('KeyA', 'å'), false, '⌥⌘A 是 Antigravity 的「归档此对话」，必须放行');
  assert.equal(pickerBackdrop.getAttribute('data-open'), 'false');
  assert.equal(pressOptionCommand('KeyT', '†'), true);
  assert.equal(pickerBackdrop.getAttribute('data-open'), 'true');
  winListeners.get('message')({ data: { type: 'antigravity-themes:toggle-picker' } });
  assert.equal(pickerBackdrop.getAttribute('data-open'), 'false', 'sidecar 转发来的快捷键应切换主窗口的切换器');
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
  assert.equal(state.themeVersion, THEME_VERSION);
  const packageVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  assert.equal(THEME_VERSION, packageVersion, 'THEME_VERSION 必须来自 package.json');
  assert.equal(state.hasChineseLocalization, true);
  assert.equal(state.hasThemePatch, true);

  const cleanState = inspectPatchState({
    preloadSource: SAMPLE_PRELOAD_WITH_ZH,
    utilsSource: SAMPLE_UTILS_WITH_ZH,
    splashSource: SAMPLE_SPLASH,
  });
  assert.equal(cleanState.hasThemePatch, false, '只有汉化等共存补丁时不算已打皮肤补丁');
});

const SIDECAR_REQUEST = { type: 'antigravity-themes:request-choices' };

function createHeadlessRuntimeEnv({ storage = new Map(), sidecarFrames = [] } = {}) {
  const rootAttrs = new Map();
  const windowListeners = new Map();
  const headChildren = [];
  const fakeRoot = {
    classList: { contains: () => false, toggle: () => {}, add: () => {}, remove: () => {} },
    dataset: {},
    style: { setProperty: () => {} },
    getAttribute: (k) => rootAttrs.get(k) ?? null,
    setAttribute: (k, v) => rootAttrs.set(k, String(v)),
  };
  const fakeHead = {
    get lastElementChild() {
      return headChildren.at(-1) ?? null;
    },
    // 与真实 DOM 一致：appendChild 已在 head 里的节点等于把它移到末尾
    appendChild(el) {
      const existingIdx = headChildren.indexOf(el);
      if (existingIdx !== -1) headChildren.splice(existingIdx, 1);
      headChildren.push(el);
      el.parentNode = fakeHead;
      Object.defineProperty(el, 'nextElementSibling', {
        configurable: true,
        get: () => headChildren[headChildren.indexOf(el) + 1] ?? null,
      });
      return el;
    },
  };
  const fakeDocument = {
    documentElement: fakeRoot,
    head: fakeHead,
    body: null,
    addEventListener: () => {},
    getElementById: (id) => headChildren.find((el) => el.id === id) ?? null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === 'iframe[data-testid="sidecar-iframe"]' ? sidecarFrames : []),
    createElement: (tag) => ({ tagName: tag.toUpperCase(), id: '', textContent: '', parentNode: null }),
  };
  const fakeWindow = {
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
    },
    addEventListener: (name, fn) => windowListeners.set(name, [...(windowListeners.get(name) ?? []), fn]),
  };
  fakeWindow.parent = fakeWindow;
  return { fakeDocument, fakeWindow, rootAttrs, windowListeners, headChildren };
}

function runRuntimeIn(env, runtimeScript) {
  new Function('document', 'window', 'setTimeout', runtimeScript)(env.fakeDocument, env.fakeWindow, () => 0);
}

test('皮肤样式表只在后面出现新样式表时才挪到 head 末尾，modulepreload 等节点不触发重排', () => {
  const runtimeScript = buildThemeRuntimeScript('iris', 'starlight');
  const env = createHeadlessRuntimeEnv();
  runRuntimeIn(env, runtimeScript);
  const [onLoad] = env.windowListeners.get('load');
  const fakeHeadNode = (tagName, rel = null) => ({ tagName, getAttribute: (k) => (k === 'rel' ? rel : null) });
  const skinStyleIndex = () => env.headChildren.findIndex((el) => el.id === 'antigravity-themes-style');

  assert.equal(skinStyleIndex(), 0);

  env.fakeDocument.head.appendChild(fakeHeadNode('LINK', 'modulepreload'));
  env.fakeDocument.head.appendChild(fakeHeadNode('SCRIPT'));
  onLoad();
  assert.equal(skinStyleIndex(), 0, 'modulepreload / script 不影响层叠顺序，不应重排');

  env.fakeDocument.head.appendChild(fakeHeadNode('LINK', 'stylesheet'));
  onLoad();
  assert.equal(skinStyleIndex(), env.headChildren.length - 1, '后面出现样式表时必须挪到末尾');

  env.fakeDocument.head.appendChild(fakeHeadNode('STYLE'));
  onLoad();
  assert.equal(skinStyleIndex(), env.headChildren.length - 1);
});

test('runtime 在同一窗口被重复注入时只初始化一次（sidecar 每次加载会注入两次）', () => {
  const runtimeScript = buildThemeRuntimeScript('iris', 'starlight');
  const env = createHeadlessRuntimeEnv();
  runRuntimeIn(env, runtimeScript);
  runRuntimeIn(env, runtimeScript);
  assert.equal(env.windowListeners.get('message').length, 1);
  assert.equal(env.windowListeners.get('load').length, 1);
  assert.equal(env.windowListeners.get('keydown').length, 1);
});

test('sidecar iframe 启动时向主窗口索取主题选择，且只接受 parent 下发的配置', () => {
  const runtimeScript = buildThemeRuntimeScript('iris', 'starlight');
  const messagesToParent = [];
  const parentWindow = { postMessage: (message, targetOrigin) => messagesToParent.push({ message, targetOrigin }) };
  const env = createHeadlessRuntimeEnv();
  env.fakeWindow.parent = parentWindow;
  runRuntimeIn(env, runtimeScript);

  assert.deepEqual(messagesToParent, [{ message: SIDECAR_REQUEST, targetOrigin: '*' }]);
  assert.equal(env.rootAttrs.get('data-at-preset'), 'iris');

  const [onMessage] = env.windowListeners.get('message');
  const choices = {
    'antigravity-themes:preset': 'emerald',
    'antigravity-themes:backdrop': 'none',
    'antigravity-themes:density': 'comfortable',
    'antigravity-themes:mode': 'light',
  };
  onMessage({ source: { postMessage() {} }, data: { type: 'antigravity-themes:choices', choices } });
  assert.equal(env.rootAttrs.get('data-at-preset'), 'iris', '非 parent 来源的消息必须忽略');

  onMessage({ source: parentWindow, data: { type: 'antigravity-themes:choices', choices } });
  assert.equal(env.rootAttrs.get('data-at-preset'), 'emerald');
  assert.equal(env.rootAttrs.get('data-at-backdrop'), 'none');
  assert.equal(env.rootAttrs.get('data-at-density'), 'comfortable');
  assert.equal(env.rootAttrs.get('data-at-mode'), 'light');

  assert.throws(
    () => onMessage({ source: parentWindow, data: { type: 'antigravity-themes:choices', choices: 'emerald' } }),
    /choices 不是对象: "emerald"/
  );

  const [onKeydown] = env.windowListeners.get('keydown');
  onKeydown({ metaKey: true, altKey: true, shiftKey: false, code: 'KeyT', key: '†', preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(
    messagesToParent.at(-1),
    { message: { type: 'antigravity-themes:toggle-picker' }, targetOrigin: '*' },
    '焦点在 sidecar 里按 ⌥⌘T 应转发给主窗口'
  );
});

test('主窗口在主题选择变化或收到索取请求时，向 sidecar iframe 下发实际生效的选择', () => {
  const runtimeScript = buildThemeRuntimeScript('iris', 'starlight');
  const messagesToSidecar = [];
  const sidecarFrame = {
    contentWindow: { postMessage: (message, targetOrigin) => messagesToSidecar.push({ message, targetOrigin }) },
  };
  const storage = new Map([
    ['antigravity-themes:preset', 'stone'],
    ['antigravity-themes:mode', 'auto'],
  ]);
  const env = createHeadlessRuntimeEnv({ storage, sidecarFrames: [sidecarFrame] });
  runRuntimeIn(env, runtimeScript);

  assert.equal(messagesToSidecar.length, 1);
  assert.deepEqual(messagesToSidecar[0], {
    targetOrigin: '*',
    message: {
      type: 'antigravity-themes:choices',
      choices: {
        'antigravity-themes:preset': 'stone',
        'antigravity-themes:backdrop': 'starlight',
        'antigravity-themes:density': 'compact',
        // auto 偏好下发的是实际生效的明暗（无 matchMedia 时探测结果为 dark）
        'antigravity-themes:mode': 'dark',
      },
    },
  });

  const [onLoad] = env.windowListeners.get('load');
  onLoad();
  assert.equal(messagesToSidecar.length, 1, '选择未变化时不应重复下发');

  storage.set('antigravity-themes:preset', 'mono');
  onLoad();
  assert.equal(messagesToSidecar.length, 2);
  assert.equal(messagesToSidecar[1].message.choices['antigravity-themes:preset'], 'mono');

  const [onMessage] = env.windowListeners.get('message');
  onMessage({ source: sidecarFrame.contentWindow, data: SIDECAR_REQUEST });
  assert.equal(messagesToSidecar.length, 3);
});
