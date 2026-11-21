import {
  DEFAULT_BACKDROP,
  DEFAULT_PRESET,
  THEME_NAME,
  THEME_VERSION,
  buildThemeRuntimeScript,
  getPresetNativeColors,
  resolveStageBackdrop,
  resolveThemePreset,
} from './theme-bundle.mjs';

export const PRELOAD_MARKER_START = '/* --- ANTIGRAVITY-THEMES START --- */';
export const PRELOAD_MARKER_END = '/* --- ANTIGRAVITY-THEMES END --- */';
export const SIDECAR_MARKER_START = '/* --- ANTIGRAVITY-THEMES-SIDECAR START --- */';
export const SIDECAR_MARKER_END = '/* --- ANTIGRAVITY-THEMES-SIDECAR END --- */';

// 仅用于识别常见共存补丁（如本机汉化），绝不修改其内容
const CHINESE_LOCALIZATION_MARKER = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';

const UTILS_SIDECAR_ANCHOR = "hubContents.on('will-navigate', guardExternalNavigation);";

function buildUtilsColorRules(preset) {
  const colors = getPresetNativeColors(preset);
  return [
    {
      name: 'curtain-fallback',
      original: "return getThemeMode().toUpperCase().includes('LIGHT') ? '#FAFAFA' : '#131313';",
      patched: `return getThemeMode().toUpperCase().includes('LIGHT') ? '${colors.lightBg}' : '${colors.darkBg}';`,
    },
    {
      name: 'window-background',
      original: "const backgroundColor = isLight ? '#FAFAFA' : '#131313';",
      patched: `const backgroundColor = isLight ? '${colors.lightBg}' : '${colors.darkBg}';`,
    },
    {
      name: 'window-foreground',
      original: "const foregroundColor = isLight ? '#383A42' : '#FAFAFA';",
      patched: `const foregroundColor = isLight ? '${colors.lightFg}' : '${colors.darkFg}';`,
    },
  ];
}

function buildSplashColorRules(preset) {
  const colors = getPresetNativeColors(preset);
  return [
    {
      name: 'splash-bg',
      original: "const bg = dark ? '#131313' : '#FAFAFA';",
      patched: `const bg = dark ? '${colors.darkBg}' : '${colors.lightBg}';`,
    },
    {
      name: 'splash-fg',
      original: "const fg = dark ? '#FAFAFA' : '#383A42';",
      patched: `const fg = dark ? '${colors.darkFg}' : '${colors.lightFg}';`,
    },
    {
      name: 'splash-sub',
      original: "const sub = dark ? '#9A9A9A' : '#6B6E76';",
      patched: `const sub = dark ? '${colors.darkSub}' : '${colors.lightSub}';`,
    },
  ];
}

function stripMarkedBlock(source, startMarker, endMarker) {
  let result = source;
  while (true) {
    const startIdx = result.indexOf(startMarker);
    if (startIdx === -1) break;
    const endIdx = result.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) {
      throw new Error(`Malformed patch block: found "${startMarker}" without matching "${endMarker}"`);
    }
    const before = result.slice(0, startIdx).replace(/\r?\n[ \t]*$/, '');
    const after = result.slice(endIdx + endMarker.length).replace(/^\r?\n/, '');
    result = before && after ? `${before}\n${after}` : `${before}${after}`;
  }
  return result;
}

function wrapInlineRule(original, patched) {
  const encodedOriginal = Buffer.from(original, 'utf8').toString('base64');
  return `/* antigravity-themes:orig:${encodedOriginal} */ ${patched} /* antigravity-themes:end */`;
}

function stripInlineRules(source) {
  return source.replace(
    /\/\* antigravity-themes:orig:([A-Za-z0-9+/=]+) \*\/ [\s\S]*? \/\* antigravity-themes:end \*\//g,
    (_full, encodedOriginal) => Buffer.from(encodedOriginal, 'base64').toString('utf8')
  );
}

function applyInlineColorRules(source, rules) {
  let current = stripInlineRules(source);
  const appliedColors = [];
  const skippedColors = [];

  for (const rule of rules) {
    if (current.includes(rule.original)) {
      current = current.replace(rule.original, () => wrapInlineRule(rule.original, rule.patched));
      appliedColors.push(rule.name);
    } else {
      skippedColors.push(rule.name);
    }
  }
  return { content: current, appliedColors, skippedColors };
}

function buildSidecarInjectorBlock() {
  return `${SIDECAR_MARKER_START}
    const getAntigravityThemesSidecarScript = () => {
        const preloadPath = typeof path_1 !== 'undefined' && path_1 && path_1.default
            ? path_1.default.join(__dirname, 'preload.js')
            : require('path').join(__dirname, 'preload.js');
        const cacheKey = '__antigravityThemesScript:' + preloadPath;
        if (typeof globalThis[cacheKey] === 'string') {
            return globalThis[cacheKey];
        }
        const fsMod = require('fs');
        const preloadSrc = fsMod.readFileSync(preloadPath, 'utf8');
        const startMarker = ${JSON.stringify(PRELOAD_MARKER_START)};
        const endMarker = ${JSON.stringify(PRELOAD_MARKER_END)};
        const startIdx = preloadSrc.indexOf(startMarker);
        const endIdx = startIdx !== -1 ? preloadSrc.indexOf(endMarker, startIdx + startMarker.length) : -1;
        if (startIdx === -1 || endIdx === -1) {
            return '';
        }
        const extracted = preloadSrc.slice(startIdx, endIdx + endMarker.length);
        globalThis[cacheKey] = extracted;
        return extracted;
    };
    const resolveAntigravityThemesSubframe = (event, frameProcessId, frameRoutingId) => {
        if (event && event.frame) return event.frame;
        if (typeof frameProcessId === 'number' && typeof frameRoutingId === 'number' && electron_1.webFrameMain?.fromId) {
            return electron_1.webFrameMain.fromId(frameProcessId, frameRoutingId);
        }
        return null;
    };
    const isAntigravityThemesSidecarUrl = (targetUrl) => {
        try {
            const target = new URL(targetUrl);
            const iframes = document.querySelectorAll('iframe[data-testid="sidecar-iframe"]');
            for (const el of iframes) {
                const raw = el.getAttribute('src') || el.src || '';
                if (!raw) continue;
                const parsed = new URL(raw, location.href);
                if (parsed.origin !== target.origin) continue;
                const baseDir = parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/') + 1);
                if (parsed.origin !== location.origin || target.pathname === parsed.pathname || target.pathname.startsWith(baseDir)) {
                    return true;
                }
            }
        } catch (_err) {}
        return false;
    };
    const injectAntigravityThemesIntoSidecar = (frame) => {
        if (!frame || frame.isDestroyed?.() || win?.isDestroyed?.() || hubContents.isDestroyed?.()) return;
        const mainFrame = hubContents.mainFrame;
        if (!mainFrame || frame === mainFrame || frame.parent !== mainFrame) return;
        const frameUrl = String(frame.url || '');
        if (!/^(?:https?|plugin):\\/\\//i.test(frameUrl)) return;
        const script = getAntigravityThemesSidecarScript();
        if (!script) return;
        const checkExpr = '(' + isAntigravityThemesSidecarUrl.toString() + ')(' + JSON.stringify(frameUrl) + ')';
        Promise.resolve(mainFrame.executeJavaScript(checkExpr))
            .then((matched) => {
                if (!matched || frame.isDestroyed?.() || win?.isDestroyed?.() || hubContents.isDestroyed?.()) return;
                return frame.executeJavaScript(script);
            })
            .catch((err) => {
                console.warn('[antigravity-themes] Sidecar 皮肤注入失败:', err?.message ?? err);
            });
    };
    const onAntigravityThemesFrameNavigate = (event, _url, _code, _status, isMainFrame, pid, rid) => {
        if (isMainFrame) return;
        injectAntigravityThemesIntoSidecar(resolveAntigravityThemesSubframe(event, pid, rid));
    };
    const onAntigravityThemesFrameFinish = (event, isMainFrame, pid, rid) => {
        if (isMainFrame) return;
        injectAntigravityThemesIntoSidecar(resolveAntigravityThemesSubframe(event, pid, rid));
    };
    hubContents.on('did-frame-navigate', onAntigravityThemesFrameNavigate);
    hubContents.on('did-frame-finish-load', onAntigravityThemesFrameFinish);
    if (win && typeof win.on === 'function') {
        win.on('closed', () => {
            hubContents.off?.('did-frame-navigate', onAntigravityThemesFrameNavigate);
            hubContents.off?.('did-frame-finish-load', onAntigravityThemesFrameFinish);
        });
    }
    ${SIDECAR_MARKER_END}`;
}

/**
 * 幂等注入皮肤到 dist/preload.js（保留任何已有的第三方补丁）
 */
export function patchPreloadSource(
  preloadSource,
  preset = DEFAULT_PRESET,
  backdrop = DEFAULT_BACKDROP,
  runtimeScript = null
) {
  const resolvedPreset = resolveThemePreset(preset);
  const resolvedBackdrop = resolveStageBackdrop(backdrop);
  const script = runtimeScript ?? buildThemeRuntimeScript(resolvedPreset, resolvedBackdrop);
  const cleaned = stripMarkedBlock(preloadSource, PRELOAD_MARKER_START, PRELOAD_MARKER_END);
  const block = [
    PRELOAD_MARKER_START,
    `/* antigravity-themes=${THEME_NAME}/${resolvedPreset}+${resolvedBackdrop}@${THEME_VERSION} */`,
    script,
    PRELOAD_MARKER_END,
  ].join('\n');

  const prefix = cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`;
  return `${prefix}${block}\n`;
}

/**
 * 精准移除 dist/preload.js 中的皮肤标记块，不触碰其他补丁
 */
export function stripPreloadSource(preloadSource) {
  const cleaned = stripMarkedBlock(preloadSource, PRELOAD_MARKER_START, PRELOAD_MARKER_END);
  return cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`;
}

/**
 * 幂等注入原生窗口配色与 Sidecar iframe 皮肤钩子到 dist/utils.js
 */
export function patchUtilsSource(utilsSource, preset = DEFAULT_PRESET) {
  const resolvedPreset = resolveThemePreset(preset);
  let cleaned = stripMarkedBlock(utilsSource, SIDECAR_MARKER_START, SIDECAR_MARKER_END);
  const colorResult = applyInlineColorRules(cleaned, buildUtilsColorRules(resolvedPreset));
  cleaned = colorResult.content;

  let sidecarInjected = false;
  const anchorIdx = cleaned.indexOf(UTILS_SIDECAR_ANCHOR);
  if (anchorIdx !== -1) {
    const before = cleaned.slice(0, anchorIdx);
    const after = cleaned.slice(anchorIdx);
    cleaned = `${before}${buildSidecarInjectorBlock()}\n    ${after}`;
    sidecarInjected = true;
  }

  return {
    content: cleaned,
    sidecarInjected,
    appliedColors: colorResult.appliedColors,
    skippedColors: colorResult.skippedColors,
  };
}

/**
 * 精准移除 dist/utils.js 中的皮肤配色与 Sidecar 注入块
 */
export function stripUtilsSource(utilsSource) {
  const withoutSidecar = stripMarkedBlock(utilsSource, SIDECAR_MARKER_START, SIDECAR_MARKER_END);
  return stripInlineRules(withoutSidecar);
}

/**
 * 幂等注入启动等待窗底色到 dist/provisionSplash.js
 */
export function patchSplashSource(splashSource, preset = DEFAULT_PRESET) {
  const resolvedPreset = resolveThemePreset(preset);
  return applyInlineColorRules(splashSource, buildSplashColorRules(resolvedPreset));
}

/**
 * 精准还原 dist/provisionSplash.js 中的皮肤底色标记
 */
export function stripSplashSource(splashSource) {
  return stripInlineRules(splashSource);
}

/**
 * 检查当前 ASAR 文本中的皮肤与共存补丁状态
 */
export function inspectPatchState({ preloadSource, utilsSource, splashSource }) {
  const preloadPatched =
    preloadSource.includes(PRELOAD_MARKER_START) && preloadSource.includes(PRELOAD_MARKER_END);
  const sidecarPatched =
    utilsSource.includes(SIDECAR_MARKER_START) && utilsSource.includes(SIDECAR_MARKER_END);
  const utilsColorsPatched = utilsSource.includes('/* antigravity-themes:orig:');
  const splashColorsPatched = splashSource ? splashSource.includes('/* antigravity-themes:orig:') : false;

  const versionMatch = preloadSource.match(
    /\/\* antigravity-themes=([a-z0-9-]+)(?:\/([a-z0-9-]+)(?:\+([a-z0-9-]+))?)?@([0-9.]+) \*\//i
  );
  const hasChineseLocalization = preloadSource.includes(CHINESE_LOCALIZATION_MARKER);

  return {
    installed: preloadPatched,
    themeId: versionMatch ? versionMatch[1] : null,
    themePreset: versionMatch ? (versionMatch[2] ?? DEFAULT_PRESET) : null,
    stageBackdrop: versionMatch ? (versionMatch[3] ?? DEFAULT_BACKDROP) : null,
    themeVersion: versionMatch ? versionMatch[4] : null,
    preloadPatched,
    sidecarPatched,
    utilsColorsPatched,
    splashColorsPatched,
    hasThemePatch: preloadPatched || sidecarPatched || utilsColorsPatched || splashColorsPatched,
    hasChineseLocalization,
  };
}
