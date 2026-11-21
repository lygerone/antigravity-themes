// antigravity-themes (v1.0.0) 渲染进程主题引擎与内置实时切换器
// 由 theme-bundle.mjs 内联样式表、默认主题预设与默认顶栏纹理后注入 preload / sidecar

(() => {
  if (typeof document === 'undefined') {
    return;
  }

  const SKIN_ID = 'studio';
  const DEFAULT_SKIN_PRESET = __AT_THEME_PRESET__;
  const DEFAULT_STAGE_BACKDROP = __AT_THEME_BACKDROP__;
  const DEFAULT_DENSITY = 'compact';
  const STYLE_ELEMENT_ID = 'antigravity-themes-style';
  const STAGE_ELEMENT_CLASS = 'at-stage-backdrop';
  const STORAGE_PRESET_KEY = 'antigravity-themes:preset';
  const STORAGE_BACKDROP_KEY = 'antigravity-themes:backdrop';
  const STORAGE_DENSITY_KEY = 'antigravity-themes:density';
  const STORAGE_MODE_KEY = 'antigravity-themes:mode';
  const SKIN_CSS = __AT_THEME_CSS__;

  const THEME_CATALOG = [
    {
      id: 'iris',
      label: 'Iris',
      desc: '纯白紫雾 / 暗夜曜紫',
      light: { canvas: '#ffffff', sidebar: '#f7f6fb', bubble: '#f2eefc', composer: '#f8f7fc', border: '#e6e4ee', accent: '#7c3aed', sky: '#3b2d7a' },
      dark: { canvas: '#111018', sidebar: '#0b0a10', bubble: '#241f3a', composer: '#161520', border: '#272536', accent: '#a78bfa', sky: '#312566' },
    },
    {
      id: 'slate',
      label: 'Slate',
      desc: '冷岩极客 / 深海暗蓝',
      light: { canvas: '#ffffff', sidebar: '#f6f8fa', bubble: '#eef4fd', composer: '#f8fafc', border: '#e2e8f0', accent: '#2563eb', sky: '#1e3a5f' },
      dark: { canvas: '#0f172a', sidebar: '#0b1120', bubble: '#1b2a47', composer: '#151f33', border: '#23304a', accent: '#38bdf8', sky: '#1c3152' },
    },
    {
      id: 'mono',
      label: 'Mono',
      desc: '画廊纯白 / OLED 纯黑',
      light: { canvas: '#ffffff', sidebar: '#f7f7f8', bubble: '#f2f2f5', composer: '#f8f8f9', border: '#e4e4e7', accent: '#18181b', sky: '#27272a' },
      dark: { canvas: '#0f0f11', sidebar: '#09090b', bubble: '#1e1e23', composer: '#151518', border: '#25252b', accent: '#3b82f6', sky: '#242429' },
    },
    {
      id: 'stone',
      label: 'Stone',
      desc: '清透暖石 / 浓缩炭黑',
      light: { canvas: '#fdfcfa', sidebar: '#f6f4f0', bubble: '#f2eee7', composer: '#f8f6f2', border: '#e6e2dc', accent: '#c25e3a', sky: '#523023' },
      dark: { canvas: '#181614', sidebar: '#11100e', bubble: '#2a2520', composer: '#1e1c19', border: '#2d2a26', accent: '#e0825e', sky: '#45281e' },
    },
    {
      id: 'emerald',
      label: 'Emerald',
      desc: '清冽雾青 / 深松黑曜',
      light: { canvas: '#ffffff', sidebar: '#f5f8f7', bubble: '#ecf6f4', composer: '#f7faf9', border: '#e0ebe8', accent: '#0d9488', sky: '#184e4a' },
      dark: { canvas: '#0f1716', sidebar: '#09100f', bubble: '#182d2a', composer: '#141e1d', border: '#20302e', accent: '#2dd4bf', sky: '#16403d' },
    },
    {
      id: 'midnight',
      label: 'Midnight',
      desc: '冰白靛蓝 / 深空蓝黑',
      light: { canvas: '#ffffff', sidebar: '#f5f7fc', bubble: '#eef1fd', composer: '#f7f9fd', border: '#e1e6f2', accent: '#4f46e5', sky: '#2a306b' },
      dark: { canvas: '#0e111b', sidebar: '#090b12', bubble: '#1d2442', composer: '#131826', border: '#212840', accent: '#818cf8', sky: '#262c5e' },
    },
  ];

  const BACKDROP_OPTIONS = [
    { id: 'starlight', label: '星空夜幕' },
    { id: 'blueprint', label: '蓝图网格' },
    { id: 'none', label: '纯净关闭' },
  ];

  const DENSITY_OPTIONS = [
    { id: 'compact', label: '紧凑' },
    { id: 'comfortable', label: '舒适' },
  ];

  const MODE_OPTIONS = [
    {
      id: 'light',
      label: '白天',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
    },
    {
      id: 'dark',
      label: '黑夜',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
    },
    {
      id: 'auto',
      label: '自动',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
    },
  ];

  const VALID_PRESET_IDS = new Set(THEME_CATALOG.map((item) => item.id));
  const VALID_BACKDROP_IDS = new Set(BACKDROP_OPTIONS.map((item) => item.id));
  const VALID_DENSITY_IDS = new Set(DENSITY_OPTIONS.map((item) => item.id));
  const VALID_MODE_IDS = new Set(MODE_OPTIONS.map((item) => item.id));

  // 原创星空夜幕顶栏矢量纹理（色板随当前主题变量动态响应）
  const STARLIGHT_SKY_SVG = `<svg data-stage-art="starlight" fill="none" preserveAspectRatio="xMidYMin slice" viewBox="0 0 320 96" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="at-sky-base" x1="0" y1="0" x2="320" y2="96" gradientUnits="userSpaceOnUse">
        <stop style="stop-color:var(--stage-sky-bottom)" />
        <stop offset="0.52" style="stop-color:var(--stage-sky-mid)" />
        <stop offset="1" style="stop-color:var(--stage-sky-top)" />
      </linearGradient>
      <radialGradient id="at-sky-nebula" cx="0" cy="0" r="1" gradientTransform="translate(242 22) rotate(148) scale(138 78)" gradientUnits="userSpaceOnUse">
        <stop style="stop-color:var(--stage-sky-glow-highlight)" stop-opacity="0.34" />
        <stop offset="0.55" style="stop-color:var(--stage-sky-glow-secondary)" stop-opacity="0.14" />
        <stop offset="1" style="stop-color:var(--stage-sky-bottom)" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="at-sky-mist" x1="0" y1="56" x2="320" y2="96" gradientUnits="userSpaceOnUse">
        <stop style="stop-color:var(--stage-sky-highlight)" stop-opacity="0.44" />
        <stop offset="0.5" style="stop-color:var(--stage-sky-secondary)" stop-opacity="0.52" />
        <stop offset="1" style="stop-color:var(--stage-sky-tertiary)" stop-opacity="0.44" />
      </linearGradient>
      <filter id="at-sky-blur" x="-20" y="-20" width="360" height="136" filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
    <rect width="320" height="96" fill="url(#at-sky-base)" />
    <rect width="320" height="96" fill="url(#at-sky-nebula)" />
    <g style="fill:var(--stage-sky-line)">
      <circle cx="18" cy="14" r="0.7" fill-opacity="0.82" />
      <circle cx="46" cy="26" r="0.5" fill-opacity="0.55" />
      <circle cx="74" cy="10" r="0.6" fill-opacity="0.74" />
      <circle cx="108" cy="21" r="0.45" fill-opacity="0.5" />
      <circle cx="136" cy="11" r="0.7" fill-opacity="0.82" />
      <circle cx="164" cy="28" r="0.5" fill-opacity="0.54" />
      <circle cx="196" cy="13" r="0.6" fill-opacity="0.72" />
      <circle cx="228" cy="24" r="0.5" fill-opacity="0.58" />
      <circle cx="262" cy="10" r="0.7" fill-opacity="0.84" />
      <circle cx="294" cy="22" r="0.55" fill-opacity="0.64" />
      <circle cx="32" cy="38" r="0.45" fill-opacity="0.45" />
      <circle cx="148" cy="37" r="0.45" fill-opacity="0.46" />
      <circle cx="246" cy="36" r="0.45" fill-opacity="0.48" />
    </g>
    <g style="fill:var(--stage-sky-sparkle)" fill-opacity="0.82">
      <path d="M88 26 L89.1 28.4 L91.5 29.5 L89.1 30.6 L88 33 L86.9 30.6 L84.5 29.5 L86.9 28.4 Z" />
      <path d="M208 29 L208.9 31 L211 31.9 L208.9 32.8 L208 34.8 L207.1 32.8 L205 31.9 L207.1 31 Z" />
      <path d="M282 14 L282.8 15.8 L284.6 16.6 L282.8 17.4 L282 19.2 L281.2 17.4 L279.4 16.6 L281.2 15.8 Z" />
    </g>
    <g filter="url(#at-sky-blur)">
      <ellipse cx="76" cy="86" rx="92" ry="26" fill="url(#at-sky-mist)" fill-opacity="0.72" />
      <ellipse cx="238" cy="90" rx="108" ry="24" fill="url(#at-sky-mist)" fill-opacity="0.64" />
    </g>
  </svg>`;

  // 原创建筑蓝图网格顶栏矢量纹理
  const BLUEPRINT_GRID_SVG = `<svg data-stage-art="blueprint" fill="none" preserveAspectRatio="xMidYMin slice" viewBox="0 0 360 96" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="at-bp-base" x1="32" y1="0" x2="290" y2="96" gradientUnits="userSpaceOnUse">
        <stop style="stop-color:var(--stage-blueprint-bottom)" />
        <stop offset="0.55" style="stop-color:var(--stage-blueprint-mid)" />
        <stop offset="1" style="stop-color:var(--stage-blueprint-top)" />
      </linearGradient>
      <radialGradient id="at-bp-light" cx="0" cy="0" r="1" gradientTransform="translate(230 16) rotate(140) scale(132 76)" gradientUnits="userSpaceOnUse">
        <stop style="stop-color:var(--stage-blueprint-highlight)" stop-opacity="0.32" />
        <stop offset="0.55" style="stop-color:var(--stage-blueprint-secondary)" stop-opacity="0.14" />
        <stop offset="1" style="stop-color:var(--stage-blueprint-bottom)" stop-opacity="0" />
      </radialGradient>
      <pattern id="at-bp-fine" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M10 0H0V10" style="stroke:var(--stage-blueprint-grid)" stroke-opacity="0.13" stroke-width="0.5" />
      </pattern>
      <pattern id="at-bp-coarse" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" style="stroke:var(--stage-blueprint-grid)" stroke-opacity="0.25" stroke-width="0.65" />
      </pattern>
      <pattern id="at-bp-ticks" width="40" height="6" patternUnits="userSpaceOnUse">
        <path d="M8 0V2.5M16 0V2.5M24 0V4.2M32 0V2.5" style="stroke:var(--stage-blueprint-line)" stroke-opacity="0.46" stroke-width="0.55" />
      </pattern>
    </defs>
    <rect width="360" height="96" fill="url(#at-bp-base)" />
    <rect width="360" height="96" fill="url(#at-bp-light)" />
    <rect width="360" height="96" fill="url(#at-bp-fine)" />
    <rect width="360" height="96" fill="url(#at-bp-coarse)" />
    <rect width="360" height="6" fill="url(#at-bp-ticks)" />
    <g style="stroke:var(--stage-blueprint-line)" stroke-linecap="round" stroke-opacity="0.48" stroke-width="0.65">
      <path d="M168 58H268" stroke-dasharray="4 4" />
      <path d="M168 54V62M268 54V62" />
      <circle cx="218" cy="36" r="14" stroke-dasharray="3 4" stroke-opacity="0.38" />
      <path d="M214 36H222M218 32V40" />
      <path d="M48 52H54M51 49V55" />
    </g>
  </svg>`;

  const CHECK_ICON_SVG = `<svg class="at-picker-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5L6.5 11.5L12.5 4.5"/></svg>`;

  let observersBound = false;
  let bodyObserved = false;
  let headObserved = false;
  let hotkeyBound = false;
  let attrObserver = null;
  let headObserver = null;
  let domObserver = null;
  let sidebarObserver = null;
  let sidebarHostObserver = null;
  let observedSidebarEl = null;
  let observedSidebarHostEl = null;
  let lastFocusedBeforeModal = null;
  let nativeHostMode = null;
  let hasAppliedModeOverride = false;
  let isSyncingModeClasses = false;

  function readSavedChoice(key, validSet, fallback) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(key);
        if (stored && validSet.has(stored)) {
          return stored;
        }
      }
    } catch (_err) {
      // 受限 iframe 上下文可能禁止访问 localStorage，回退默认配置
    }
    return fallback;
  }

  function writeSavedChoice(key, value) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (_err) {
      // 忽略受限上下文写入失败
    }
  }

  function getActivePreset() {
    return readSavedChoice(STORAGE_PRESET_KEY, VALID_PRESET_IDS, DEFAULT_SKIN_PRESET);
  }

  function getActiveBackdrop() {
    return readSavedChoice(STORAGE_BACKDROP_KEY, VALID_BACKDROP_IDS, DEFAULT_STAGE_BACKDROP);
  }

  function getActiveDensity() {
    return readSavedChoice(STORAGE_DENSITY_KEY, VALID_DENSITY_IDS, DEFAULT_DENSITY);
  }

  function getActiveModePreference() {
    return readSavedChoice(STORAGE_MODE_KEY, VALID_MODE_IDS, 'auto');
  }

  function runWithoutTransitions(action) {
    const root = document.documentElement;
    if (!root || !root.classList) {
      action();
      return;
    }
    root.classList.add('at-no-transitions');
    action();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('at-no-transitions'));
      });
    } else {
      root.classList.remove('at-no-transitions');
    }
  }

  function detectHostDomMode() {
    const html = document.documentElement;
    const body = document.body;

    if (body && body.classList) {
      if (
        body.classList.contains('dark') ||
        body.classList.contains('dark-theme') ||
        body.classList.contains('theme-dark') ||
        body.classList.contains('vscode-dark')
      ) {
        return 'dark';
      }
      if (
        body.classList.contains('light') ||
        body.classList.contains('theme-light') ||
        body.classList.contains('vscode-light')
      ) {
        return 'light';
      }
    }

    if (html) {
      if (html.classList?.contains('dark') || html.dataset?.theme === 'dark') {
        return 'dark';
      }
      if (html.classList?.contains('light') || html.dataset?.theme === 'light') {
        return 'light';
      }
      const seeded = html.dataset?.agThemeSeeded;
      if (seeded === 'dark' || seeded === 'light') {
        return seeded;
      }
      const inlineScheme = html.style?.colorScheme;
      if (inlineScheme === 'dark' || inlineScheme === 'light') {
        return inlineScheme;
      }
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }

  function detectSkinMode() {
    if (!hasAppliedModeOverride) {
      nativeHostMode = detectHostDomMode();
    }
    const preference = getActiveModePreference();
    if (preference === 'light' || preference === 'dark') {
      return preference;
    }
    return nativeHostMode ?? detectHostDomMode();
  }

  function syncHostModeClasses(effectiveMode, preference) {
    if (preference === 'auto' && !hasAppliedModeOverride) {
      return;
    }
    const isDark = effectiveMode === 'dark';
    const root = document.documentElement;
    const body = document.body;

    isSyncingModeClasses = true;
    hasAppliedModeOverride = preference !== 'auto';
    if (root) {
      if (root.classList && typeof root.classList.toggle === 'function') {
        root.classList.toggle('dark', isDark);
        root.classList.toggle('light', !isDark);
      }
      if (root.style) {
        root.style.colorScheme = effectiveMode;
      }
    }
    if (body && body.classList && typeof body.classList.toggle === 'function') {
      body.classList.toggle('dark', isDark);
      body.classList.toggle('dark-theme', isDark);
      body.classList.toggle('theme-dark', isDark);
      body.classList.toggle('theme-light', !isDark);
    }
    if (attrObserver && typeof attrObserver.takeRecords === 'function') {
      attrObserver.takeRecords();
    }
    isSyncingModeClasses = false;
  }

  function syncStageArtwork(sidebarPane) {
    if (!sidebarPane || typeof document.createElement !== 'function') {
      return;
    }
    const backdropMode = getActiveBackdrop();
    let container = null;
    if (typeof sidebarPane.querySelector === 'function') {
      container = sidebarPane.querySelector(`:scope > .${STAGE_ELEMENT_CLASS}`);
    }

    if (backdropMode === 'none') {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      return;
    }

    if (!container) {
      container = document.createElement('div');
      container.className = STAGE_ELEMENT_CLASS;
      container.setAttribute('aria-hidden', 'true');
      sidebarPane.appendChild(container);
    }

    if (container.getAttribute('data-stage-variant') !== backdropMode) {
      container.setAttribute('data-stage-variant', backdropMode);
      container.innerHTML = backdropMode === 'blueprint' ? BLUEPRINT_GRID_SVG : STARLIGHT_SKY_SVG;
    }
  }

  function syncSidebarState() {
    const root = document.documentElement;
    if (!root || typeof document.querySelector !== 'function') {
      return;
    }

    const sidebarSplit = document.querySelector('[data-testid="sidebar-split"]');
    const sidebarPane = document.querySelector('[data-testid="sidebar-split"] > :first-child');
    if (!sidebarPane || typeof sidebarPane.getBoundingClientRect !== 'function') {
      if (root.getAttribute('data-at-sidebar-open') !== 'false') {
        root.setAttribute('data-at-sidebar-open', 'false');
      }
      if (observedSidebarEl && observedSidebarEl.isConnected === false) {
        observedSidebarEl = null;
      }
      return;
    }

    const applyWidth = (width) => {
      const isOpen = width > 120 ? 'true' : 'false';
      if (root.getAttribute('data-at-sidebar-open') !== isOpen) {
        root.setAttribute('data-at-sidebar-open', isOpen);
      }
      if (width > 120 && root.style && typeof root.style.setProperty === 'function') {
        root.style.setProperty('--at-sidebar-width', `${Math.round(width)}px`);
      }
    };

    applyWidth(sidebarPane.getBoundingClientRect().width);
    syncStageArtwork(sidebarPane);

    if (typeof ResizeObserver !== 'undefined' && observedSidebarEl !== sidebarPane) {
      if (sidebarObserver) {
        sidebarObserver.disconnect();
      }
      sidebarObserver = new ResizeObserver((entries) => {
        const entryWidth = entries[0]?.contentRect?.width ?? sidebarPane.getBoundingClientRect().width;
        applyWidth(entryWidth);
      });
      sidebarObserver.observe(sidebarPane);
      observedSidebarEl = sidebarPane;
    }

    const hostEl = sidebarSplit?.parentNode ?? null;
    if (typeof MutationObserver !== 'undefined' && hostEl && observedSidebarHostEl !== hostEl) {
      if (sidebarHostObserver) {
        sidebarHostObserver.disconnect();
      }
      sidebarHostObserver = new MutationObserver(() => {
        scheduleSync();
      });
      sidebarHostObserver.observe(hostEl, { childList: true });
      observedSidebarHostEl = hostEl;
    }
  }

  function applyWireframePreviewColors(cardEl, themeDef, mode) {
    const wire = typeof cardEl.querySelector === 'function' ? cardEl.querySelector('.at-picker-wire') : null;
    if (!wire || !wire.style || typeof wire.style.setProperty !== 'function') {
      return;
    }
    const swatch = mode === 'dark' ? themeDef.dark : themeDef.light;
    wire.style.setProperty('--wire-canvas', swatch.canvas);
    wire.style.setProperty('--wire-sidebar', swatch.sidebar);
    wire.style.setProperty('--wire-bubble', swatch.bubble);
    wire.style.setProperty('--wire-composer', swatch.composer);
    wire.style.setProperty('--wire-border', swatch.border);
    wire.style.setProperty('--wire-accent', swatch.accent);
    wire.style.setProperty('--wire-sky', swatch.sky);
  }

  function refreshPickerSelection() {
    const backdropEl = document.getElementById('at-theme-picker-backdrop');
    if (!backdropEl || typeof backdropEl.querySelectorAll !== 'function') {
      return;
    }
    const activePreset = getActivePreset();
    const activeBackdrop = getActiveBackdrop();
    const activeDensity = getActiveDensity();
    const activeModePref = getActiveModePreference();
    const mode = detectSkinMode();

    for (const btn of backdropEl.querySelectorAll('[data-mode-id]')) {
      const isActive = btn.getAttribute('data-mode-id') === activeModePref;
      btn.setAttribute('data-active', isActive ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    for (const card of backdropEl.querySelectorAll('.at-picker-card')) {
      const id = card.getAttribute('data-preset-id');
      const isActive = id === activePreset;
      card.setAttribute('data-active', isActive ? 'true' : 'false');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      const def = THEME_CATALOG.find((t) => t.id === id);
      if (def) {
        applyWireframePreviewColors(card, def, mode);
      }
    }
    for (const btn of backdropEl.querySelectorAll('[data-backdrop-id]')) {
      const isActive = btn.getAttribute('data-backdrop-id') === activeBackdrop;
      btn.setAttribute('data-active', isActive ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    for (const btn of backdropEl.querySelectorAll('[data-density-id]')) {
      const isActive = btn.getAttribute('data-density-id') === activeDensity;
      btn.setAttribute('data-active', isActive ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  function toggleThemePicker(forceOpen) {
    const backdropEl = document.getElementById('at-theme-picker-backdrop');
    if (!backdropEl) {
      return;
    }
    const currentlyOpen = backdropEl.getAttribute('data-open') === 'true';
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !currentlyOpen;
    if (nextOpen === currentlyOpen) {
      return;
    }

    if (nextOpen) {
      lastFocusedBeforeModal =
        document.activeElement && typeof document.activeElement.focus === 'function'
          ? document.activeElement
          : null;
      backdropEl.setAttribute('data-open', 'true');
      refreshPickerSelection();
      const activeCard =
        typeof backdropEl.querySelector === 'function'
          ? backdropEl.querySelector('.at-picker-card[data-active="true"]') ?? backdropEl.querySelector('.at-picker-card')
          : null;
      if (activeCard && typeof activeCard.focus === 'function') {
        activeCard.focus();
      }
    } else {
      backdropEl.setAttribute('data-open', 'false');
      if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
        lastFocusedBeforeModal.focus();
      }
      lastFocusedBeforeModal = null;
    }
  }

  function selectThemePreset(presetId) {
    if (!VALID_PRESET_IDS.has(presetId)) return;
    runWithoutTransitions(() => {
      writeSavedChoice(STORAGE_PRESET_KEY, presetId);
      ensureStyleInjected();
      refreshPickerSelection();
    });
  }

  function selectBackdropMode(backdropId) {
    if (!VALID_BACKDROP_IDS.has(backdropId)) return;
    runWithoutTransitions(() => {
      writeSavedChoice(STORAGE_BACKDROP_KEY, backdropId);
      ensureStyleInjected();
      refreshPickerSelection();
    });
  }

  function selectDensityMode(densityId) {
    if (!VALID_DENSITY_IDS.has(densityId)) return;
    runWithoutTransitions(() => {
      writeSavedChoice(STORAGE_DENSITY_KEY, densityId);
      ensureStyleInjected();
      refreshPickerSelection();
    });
  }

  function selectSkinMode(modeId) {
    if (!VALID_MODE_IDS.has(modeId)) return;
    runWithoutTransitions(() => {
      writeSavedChoice(STORAGE_MODE_KEY, modeId);
      ensureStyleInjected();
      refreshPickerSelection();
    });
  }

  function handlePickerKeydown(event, dialog) {
    if (event.key === 'Tab') {
      const focusables = Array.from(dialog.querySelectorAll('button:not(:disabled)'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    const cards = Array.from(dialog.querySelectorAll('.at-picker-card'));
    const currentIdx = cards.indexOf(document.activeElement);
    if (currentIdx === -1) return;

    let nextIdx = -1;
    if (event.key === 'ArrowRight') nextIdx = (currentIdx + 1) % cards.length;
    else if (event.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + cards.length) % cards.length;
    else if (event.key === 'ArrowDown') nextIdx = (currentIdx + 2) % cards.length;
    else if (event.key === 'ArrowUp') nextIdx = (currentIdx - 2 + cards.length) % cards.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = cards.length - 1;

    if (nextIdx !== -1) {
      event.preventDefault();
      cards[nextIdx].focus();
    }
  }

  function ensureThemePickerUi() {
    if (!document.body || typeof document.querySelector !== 'function') {
      return;
    }
    if (!document.querySelector('[data-testid="sidebar-split"]')) {
      return;
    }

    if (!document.getElementById('at-theme-switcher-fab')) {
      const fab = document.createElement('button');
      fab.id = 'at-theme-switcher-fab';
      fab.type = 'button';
      fab.title = '切换主题皮肤 (⌘⌥A)';
      fab.setAttribute('aria-label', '切换主题皮肤');
      fab.setAttribute('aria-haspopup', 'dialog');
      fab.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`;
      fab.addEventListener('click', () => toggleThemePicker());
      document.body.appendChild(fab);
    }

    if (!document.getElementById('at-theme-picker-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'at-theme-picker-backdrop';
      backdrop.setAttribute('data-open', 'false');

      const dialog = document.createElement('div');
      dialog.id = 'at-theme-picker-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', 'Antigravity 皮肤切换器');

      const cardsHtml = THEME_CATALOG.map(
        (t) => `<button type="button" class="at-picker-card" data-preset-id="${t.id}" aria-pressed="false">
          <span class="at-picker-wire" aria-hidden="true">
            <span class="at-picker-wire-side"><span></span><span></span><span></span></span>
            <span class="at-picker-wire-main">
              <span class="at-picker-wire-bubble"></span>
              <span class="at-picker-wire-composer"><span class="at-picker-wire-dot"></span></span>
            </span>
          </span>
          <span class="at-picker-meta">
            <span class="at-picker-name-row">
              <span class="at-picker-name">${t.label}</span>
              ${CHECK_ICON_SVG}
            </span>
            <span class="at-picker-desc">${t.desc}</span>
          </span>
        </button>`
      ).join('');

      const backdropHtml = BACKDROP_OPTIONS.map(
        (b) => `<button type="button" class="at-picker-seg-btn" data-backdrop-id="${b.id}" aria-pressed="false">${b.label}</button>`
      ).join('');

      const densityHtml = DENSITY_OPTIONS.map(
        (d) => `<button type="button" class="at-picker-seg-btn" data-density-id="${d.id}" aria-pressed="false">${d.label}</button>`
      ).join('');

      const modeHtml = MODE_OPTIONS.map(
        (m) => `<button type="button" class="at-picker-mode-btn" data-mode-id="${m.id}" aria-pressed="false" title="${m.label}模式">${m.icon}<span>${m.label}</span></button>`
      ).join('');

      dialog.innerHTML = `
        <div class="at-picker-header">
          <div class="at-picker-heading">
            <span class="at-picker-title">Antigravity 皮肤库</span>
          </div>
          <div class="at-picker-header-right">
            <div class="at-picker-mode-switch" role="group" aria-label="明暗模式切换">${modeHtml}</div>
            <span class="at-picker-shortcut">⌘⌥A</span>
          </div>
        </div>
        <div class="at-picker-grid">${cardsHtml}</div>
        <div class="at-picker-controls-row">
          <div>
            <div class="at-picker-section-label">顶栏艺术纹理</div>
            <div class="at-picker-segment at-picker-segment--3">${backdropHtml}</div>
          </div>
          <div>
            <div class="at-picker-section-label">界面密度</div>
            <div class="at-picker-segment at-picker-segment--2">${densityHtml}</div>
          </div>
        </div>
        <div class="at-picker-footer">
          <span>支持白天 / 黑夜 / 自动实时切换 · 跨窗口同步</span>
          <span>方向键切换 · Esc 关闭</span>
        </div>
      `;

      dialog.addEventListener('click', (event) => {
        const target = event.target && typeof event.target.closest === 'function' ? event.target : null;
        if (!target) return;
        const modeBtn = target.closest('[data-mode-id]');
        if (modeBtn) {
          selectSkinMode(modeBtn.getAttribute('data-mode-id'));
          return;
        }
        const card = target.closest('.at-picker-card');
        if (card) {
          selectThemePreset(card.getAttribute('data-preset-id'));
          return;
        }
        const backdropBtn = target.closest('[data-backdrop-id]');
        if (backdropBtn) {
          selectBackdropMode(backdropBtn.getAttribute('data-backdrop-id'));
          return;
        }
        const densityBtn = target.closest('[data-density-id]');
        if (densityBtn) {
          selectDensityMode(densityBtn.getAttribute('data-density-id'));
        }
      });

      dialog.addEventListener('keydown', (event) => handlePickerKeydown(event, dialog));

      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          toggleThemePicker(false);
        }
      });

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      refreshPickerSelection();
    }

    if (!hotkeyBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      hotkeyBound = true;
      window.addEventListener('keydown', (event) => {
        const isToggle =
          (event.metaKey || event.ctrlKey) &&
          event.altKey &&
          !event.shiftKey &&
          (event.code === 'KeyA' || String(event.key || '').toLowerCase() === 'a');
        if (isToggle) {
          event.preventDefault();
          event.stopPropagation();
          toggleThemePicker();
          return;
        }
        if (event.key === 'Escape') {
          const backdropEl = document.getElementById('at-theme-picker-backdrop');
          if (backdropEl?.getAttribute('data-open') === 'true') {
            event.preventDefault();
            toggleThemePicker(false);
          }
        }
      });
      window.addEventListener('storage', (event) => {
        if (
          event.key === STORAGE_PRESET_KEY ||
          event.key === STORAGE_BACKDROP_KEY ||
          event.key === STORAGE_DENSITY_KEY ||
          event.key === STORAGE_MODE_KEY
        ) {
          runWithoutTransitions(() => {
            ensureStyleInjected();
            refreshPickerSelection();
          });
        }
      });
    }
  }

  function ensureStyleInjected() {
    const root = document.documentElement;
    if (!root) {
      return false;
    }

    const modePreference = getActiveModePreference();
    const mode = detectSkinMode();
    const preset = getActivePreset();
    const backdrop = getActiveBackdrop();
    const density = getActiveDensity();
    const modeChanged = root.getAttribute('data-at-mode') !== mode;

    syncHostModeClasses(mode, modePreference);

    if (root.getAttribute('data-at-skin') !== SKIN_ID) {
      root.setAttribute('data-at-skin', SKIN_ID);
    }
    if (root.getAttribute('data-at-preset') !== preset) {
      root.setAttribute('data-at-preset', preset);
    }
    if (root.getAttribute('data-at-backdrop') !== backdrop) {
      root.setAttribute('data-at-backdrop', backdrop);
    }
    if (root.getAttribute('data-at-density') !== density) {
      root.setAttribute('data-at-density', density);
    }
    if (modeChanged) {
      root.setAttribute('data-at-mode', mode);
    }

    let styleEl = document.getElementById(STYLE_ELEMENT_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ELEMENT_ID;
      styleEl.textContent = SKIN_CSS;
      (document.head || root).appendChild(styleEl);
    } else if (document.head && styleEl.parentNode !== document.head) {
      document.head.appendChild(styleEl);
    } else if (document.head && document.head.lastElementChild !== styleEl) {
      document.head.appendChild(styleEl);
    }

    syncSidebarState();
    ensureThemePickerUi();
    if (modeChanged) {
      refreshPickerSelection();
    }
    return true;
  }

  let syncScheduled = false;
  function scheduleSync() {
    if (isSyncingModeClasses || syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(() => {
      syncScheduled = false;
      boot();
    });
  }

  function attachElementObservers() {
    if (typeof MutationObserver === 'undefined' || !document.documentElement) {
      return;
    }

    if (!observersBound) {
      observersBound = true;
      attrObserver = new MutationObserver(() => {
        if (isSyncingModeClasses) return;
        const observedDomMode = detectHostDomMode();
        const currentAttrMode = document.documentElement?.getAttribute('data-at-mode');
        if (observedDomMode !== currentAttrMode) {
          nativeHostMode = observedDomMode;
        }
        scheduleSync();
      });
      attrObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-ag-theme-seeded'],
      });

      headObserver = new MutationObserver(() => {
        if (document.head && document.head.lastElementChild?.id !== STYLE_ELEMENT_ID) {
          scheduleSync();
        }
      });

      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', scheduleSync);
        }
      }
    }

    if (!bodyObserved && document.body && attrObserver) {
      attrObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-agy-theme', 'data-has-browser-hole'],
      });
      const bodyTreeObserver = new MutationObserver(() => {
        if (!observedSidebarEl || !document.getElementById('at-theme-switcher-fab')) {
          syncSidebarState();
          ensureThemePickerUi();
          if (observedSidebarEl && document.getElementById('at-theme-switcher-fab')) {
            bodyTreeObserver.disconnect();
          }
        }
      });
      bodyTreeObserver.observe(document.body, { childList: true, subtree: true });
      bodyObserved = true;
    }

    if (!headObserved && document.head && headObserver) {
      headObserver.observe(document.head, { childList: true });
      headObserved = true;
    }

    if ((!bodyObserved || !headObserved) && !domObserver) {
      domObserver = new MutationObserver(() => {
        attachElementObservers();
        ensureStyleInjected();
        if (bodyObserved && headObserved && domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
      });
      domObserver.observe(document.documentElement, { childList: true });
    }
  }

  function boot() {
    if (!ensureStyleInjected()) {
      return;
    }
    attachElementObservers();
  }

  boot();
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('readystatechange', boot);
    document.addEventListener('DOMContentLoaded', boot);
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', boot);
  }
  for (const delayMs of [0, 50, 200, 800, 2500]) {
    setTimeout(boot, delayMs);
  }
})();
