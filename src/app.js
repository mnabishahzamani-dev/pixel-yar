'use strict';

(() => {
  const api = window.pixelYar || null;
  const MAX_ITEMS = 30;
  const SETTINGS_KEY = 'pixel-yar.settings.v1';
  const POSITIONS = new Set([
    'centre',
    'north',
    'south',
    'east',
    'west',
    'northeast',
    'northwest',
    'southeast',
    'southwest',
  ]);
  const POSITION_LABELS = {
    centre: 'وسط',
    north: 'بالا',
    south: 'پایین',
    east: 'راست',
    west: 'چپ',
    northeast: 'بالا-راست',
    northwest: 'بالا-چپ',
    southeast: 'پایین-راست',
    southwest: 'پایین-چپ',
  };
  const IMAGE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'jfif',
    'webp',
    'gif',
    'bmp',
    'tif',
    'tiff',
    'avif',
  ]);
  const STATUS_LABELS = {
    inspecting: 'بررسی',
    pending: 'در صف',
    converting: 'تبدیل',
    done: 'آماده',
    rejected: 'بزرگ‌تر',
    error: 'خطا',
  };

  const DEFAULT_SETTINGS = Object.freeze({
    qualityMode: 'target',
    targetKB: 100,
    quality: 82,
    resizeMode: 'none',
    maxEdge: 1920,
    boxWidth: 1080,
    boxHeight: 720,
    keepAspect: true,
    fit: 'contain',
    position: 'centre',
    background: 'transparent',
    preserveAlpha: true,
    autoOrient: true,
    icc: 'srgb',
    metadata: 'strip',
    rejectLarger: false,
    concurrency: 2,
    replaceOriginal: false,
    maxInputMB: 40,
    maxInputEdge: 12000,
  });

  const fa = new Intl.NumberFormat('fa-IR');
  const faDecimal = new Intl.NumberFormat('fa-IR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const el = {
    app: $('#app'),
    emptyView: $('#emptyView'),
    workspaceView: $('#workspaceView'),
    staleBanner: $('#staleBanner'),
    bannerApply: $('#bannerApply'),
    dropzone: $('#dropzone'),
    dropOverlay: $('#dropOverlay'),

    selectedMeta: $('#selectedMeta'),
    selectedBadges: $('#selectedBadges'),
    compareStage: $('#compareStage'),
    compareDivider: $('#compareDivider'),
    beforeImage: $('#beforeImage'),
    afterImage: $('#afterImage'),
    afterLayer: $('#afterLayer'),
    beforeTag: $('#beforeTag'),
    afterTag: $('#afterTag'),
    beforeDims: $('#beforeDims'),
    afterDims: $('#afterDims'),
    compareState: $('#compareState'),
    compareStateText: $('#compareStateText'),
    compareError: $('#compareError'),
    compareErrorTitle: $('#compareErrorTitle'),
    compareErrorMessage: $('#compareErrorMessage'),

    selectedThumb: $('#selectedThumb'),
    selectedName: $('#selectedName'),
    selectedInfo: $('#selectedInfo'),
    saveState: $('#saveState'),
    removeButton: $('#removeButton'),
    outSize: $('#outSize'),
    outSub: $('#outSub'),
    savings: $('#savings'),
    savingsSub: $('#savingsSub'),
    outDims: $('#outDims'),
    outQuality: $('#outQuality'),
    resultNote: $('#resultNote'),
    saveButton: $('#saveButton'),
    saveLabel: $('#saveLabel'),
    saveAllButton: $('#saveAllButton'),
    saveAllLabel: $('#saveAllLabel'),
    addButton: $('#addButton'),

    queueCard: $('#queueCard'),
    queue: $('#queue'),
    queueCount: $('#queueCount'),
    queueAddButton: $('#queueAddButton'),
    reconvertButton: $('#reconvertButton'),
    cancelButton: $('#cancelButton'),
    queueProgress: $('#queueProgress'),
    progressFill: $('#progressFill'),
    progressLabel: $('#progressLabel'),
    totalIn: $('#totalIn'),
    totalOut: $('#totalOut'),
    totalSaved: $('#totalSaved'),
    queueTemplate: $('#queueTemplate'),

    settingsPanel: $('#settingsPanel'),
    targetGroup: $('#targetGroup'),
    targetKB: $('#targetKB'),
    targetPresets: $('#targetPresets'),
    manualGroup: $('#manualGroup'),
    qualityRange: $('#qualityRange'),
    qualityValue: $('#qualityValue'),
    maxEdgeGroup: $('#maxEdgeGroup'),
    maxEdge: $('#maxEdge'),
    maxEdgePresets: $('#maxEdgePresets'),
    boxGroup: $('#boxGroup'),
    boxWidth: $('#boxWidth'),
    boxHeight: $('#boxHeight'),
    boxPresets: $('#boxPresets'),
    keepAspect: $('#keepAspect'),
    fitGroup: $('#fitGroup'),
    positionGroup: $('#positionGroup'),
    positionGrid: $('#positionGrid'),
    positionLabel: $('#positionLabel'),
    backgroundGroup: $('#backgroundGroup'),
    bgColor: $('#bgColor'),
    bgColorLabel: $('#bgColorLabel'),
    backgroundHint: $('#backgroundHint'),
    transparentButton: $('#transparentButton'),
    boxHint: $('#boxHint'),
    stretchWarning: $('#stretchWarning'),
    preserveAlpha: $('#preserveAlpha'),
    autoOrient: $('#autoOrient'),
    iccSelect: $('#iccSelect'),
    iccHint: $('#iccHint'),
    stripMetadata: $('#stripMetadata'),
    metadataNote: $('#metadataNote'),
    concurrencyRange: $('#concurrencyRange'),
    concurrencyValue: $('#concurrencyValue'),
    concurrencyHint: $('#concurrencyHint'),
    rejectLarger: $('#rejectLarger'),
    replaceOriginal: $('#replaceOriginal'),
    replaceRow: $('#replaceRow'),
    replaceNote: $('#replaceNote'),
    maxInputMB: $('#maxInputMB'),
    maxInputEdge: $('#maxInputEdge'),
    applySettings: $('#applySettings'),
    resetSettings: $('#resetSettings'),
    settingsHint: $('#settingsHint'),

    toast: $('#toast'),
    toastTitle: $('#toastTitle'),
    toastMessage: $('#toastMessage'),
    toastAction: $('#toastAction'),
    toastClose: $('#toastClose'),
    instagramButton: $('#instagramButton'),
    githubButton: $('#githubButton'),
  };

  const state = {
    settings: loadSettings(),
    items: [],
    selectedId: null,
    split: 50,
    running: false,
    inspecting: false,
    runId: null,
    runSignature: null,
    appliedSignature: null,
    runTotal: 0,
    runSettled: 0,
    cancelRequested: false,
    saving: false,
    dragDepth: 0,
    queueNodes: new Map(),
    toastAutoTimer: null,
    toastHideTimer: null,
    toastActionHandler: null,
  };

  init();

  function init() {
    if (!api) {
      document.body.classList.add('is-browser');
    }

    renderSettingsForm();
    bindEvents();
    bindTabs();
    bindCompare();
    bindWindowControls();
    bindDragAndDrop();

    renderViews();
    syncQueue();
    renderSummary();
    updateTotals();
    updateProgress();
    refreshBusyControls();
    setCompareSplit(50);
    refreshSettingsUI();

    if (api) {
      api.onConversionProgress(handleProgress);
    }
  }

  /* ---------- helpers ---------- */

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clampInt(value, fallback, min, max) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function oneOf(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function sanitizeSettings(raw = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
    const keepAspect = merged.keepAspect !== false;
    const fit = keepAspect ? (merged.fit === 'cover' ? 'cover' : 'contain') : 'stretch';
    const background =
      /^#[0-9a-f]{6}$/i.test(String(merged.background)) || merged.background === 'transparent'
        ? String(merged.background).toLowerCase()
        : DEFAULT_SETTINGS.background;

    return {
      qualityMode: merged.qualityMode === 'manual' ? 'manual' : 'target',
      targetKB: clampInt(merged.targetKB, DEFAULT_SETTINGS.targetKB, 10, 5000),
      quality: clampInt(merged.quality, DEFAULT_SETTINGS.quality, 30, 100),
      resizeMode: oneOf(merged.resizeMode, ['none', 'max', 'box'], DEFAULT_SETTINGS.resizeMode),
      maxEdge: clampInt(merged.maxEdge, DEFAULT_SETTINGS.maxEdge, 64, 12000),
      boxWidth: clampInt(merged.boxWidth, DEFAULT_SETTINGS.boxWidth, 16, 8192),
      boxHeight: clampInt(merged.boxHeight, DEFAULT_SETTINGS.boxHeight, 16, 8192),
      keepAspect,
      fit,
      position: oneOf(merged.position, [...POSITIONS], DEFAULT_SETTINGS.position),
      background,
      preserveAlpha: merged.preserveAlpha !== false,
      autoOrient: merged.autoOrient !== false,
      icc: oneOf(merged.icc, ['srgb', 'keep', 'strip'], DEFAULT_SETTINGS.icc),
      metadata: merged.metadata === 'keep' ? 'keep' : 'strip',
      rejectLarger: merged.rejectLarger === true,
      concurrency: clampInt(merged.concurrency, DEFAULT_SETTINGS.concurrency, 1, 4),
      replaceOriginal: merged.replaceOriginal === true,
      maxInputMB: clampInt(merged.maxInputMB, DEFAULT_SETTINGS.maxInputMB, 1, 200),
      maxInputEdge: clampInt(merged.maxInputEdge, DEFAULT_SETTINGS.maxInputEdge, 256, 20000),
    };
  }

  function settingsSignature(settings) {
    const s = sanitizeSettings(settings);
    return JSON.stringify({
      qualityMode: s.qualityMode,
      targetKB: s.targetKB,
      quality: s.quality,
      resizeMode: s.resizeMode,
      maxEdge: s.maxEdge,
      boxWidth: s.boxWidth,
      boxHeight: s.boxHeight,
      keepAspect: s.keepAspect,
      fit: s.fit,
      position: s.position,
      background: s.background,
      preserveAlpha: s.preserveAlpha,
      autoOrient: s.autoOrient,
      icc: s.icc,
      metadata: s.metadata,
      rejectLarger: s.rejectLarger,
      maxInputMB: s.maxInputMB,
      maxInputEdge: s.maxInputEdge,
    });
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (stored && typeof stored === 'object') return sanitizeSettings(stored);
    } catch {
      /* ignore broken storage */
    }
    return sanitizeSettings(DEFAULT_SETTINGS);
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch {
      /* storage is optional */
    }
  }

  function baseName(filePath) {
    const chunks = String(filePath || '').split(/[\\/]/);
    return chunks[chunks.length - 1] || String(filePath || '');
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 1024) return `${fa.format(Math.round(value))} بایت`;
    const kb = value / 1024;
    if (kb < 1024) return `${faDecimal.format(kb)} کیلوبایت`;
    return `${faDecimal.format(kb / 1024)} مگابایت`;
  }

  function formatSizeShort(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 1024) return `${fa.format(Math.round(value))} B`;
    const kb = value / 1024;
    if (kb < 1024) return `${fa.format(Math.round(kb))} KB`;
    return `${faDecimal.format(kb / 1024)} MB`;
  }

  function formatDims(width, height) {
    if (!width || !height) return '—';
    return `${fa.format(width)} × ${fa.format(height)}`;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    if (ms < 1000) return `${fa.format(Math.round(ms))} میلی‌ثانیه`;
    return `${faDecimal.format(ms / 1000)} ثانیه`;
  }

  function makeObjectUrl(bytes) {
    if (!bytes) return null;
    try {
      let view = null;
      if (bytes instanceof ArrayBuffer) {
        view = new Uint8Array(bytes);
      } else if (ArrayBuffer.isView(bytes)) {
        view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      } else if (Array.isArray(bytes)) {
        view = new Uint8Array(bytes);
      }
      if (!view || view.byteLength === 0) return null;
      return URL.createObjectURL(new Blob([view], { type: 'image/webp' }));
    } catch {
      return null;
    }
  }

  function revokeUrl(url) {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
  }

  function setImageSource(image, url) {
    if (!url) {
      image.removeAttribute('src');
      return;
    }
    if (image.getAttribute('src') !== url) image.src = url;
  }

  function getItem(id) {
    return state.items.find((item) => item.id === id) || null;
  }

  function getSelectedItem() {
    return getItem(state.selectedId) || state.items[0] || null;
  }

  function isDirty() {
    if (!state.items.some((item) => item.result)) return false;
    return state.appliedSignature !== settingsSignature(state.settings);
  }

  /* ---------- settings form ---------- */

  function commitSettings(patch) {
    if (patch) Object.assign(state.settings, patch);
    state.settings = sanitizeSettings(state.settings);
    saveSettings();
    refreshSettingsUI();
  }

  function renderSettingsForm() {
    const s = state.settings;
    el.targetKB.value = String(s.targetKB);
    el.qualityRange.value = String(s.quality);
    el.maxEdge.value = String(s.maxEdge);
    el.boxWidth.value = String(s.boxWidth);
    el.boxHeight.value = String(s.boxHeight);
    el.keepAspect.checked = s.keepAspect;
    el.bgColor.value = s.background === 'transparent' ? '#ffffff' : s.background;
    el.preserveAlpha.checked = s.preserveAlpha;
    el.autoOrient.checked = s.autoOrient;
    el.iccSelect.value = s.icc;
    el.stripMetadata.checked = s.metadata === 'strip';
    el.concurrencyRange.value = String(s.concurrency);
    el.rejectLarger.checked = s.rejectLarger;
    el.replaceOriginal.checked = s.replaceOriginal;
    el.maxInputMB.value = String(s.maxInputMB);
    el.maxInputEdge.value = String(s.maxInputEdge);
    refreshSettingsUI();
  }

  function setInputIfIdle(input, value) {
    if (document.activeElement !== input) input.value = String(value);
  }

  function refreshSettingsUI() {
    const s = state.settings;
    const busy = state.running || state.inspecting;

    $$('input[name="qualityMode"]').forEach((input) => {
      input.checked = input.value === s.qualityMode;
    });
    el.targetGroup.hidden = s.qualityMode !== 'target';
    el.manualGroup.hidden = s.qualityMode !== 'manual';
    el.qualityValue.textContent = fa.format(s.quality);
    el.qualityRange.style.setProperty('--p', `${((s.quality - 30) / 70) * 100}%`);
    $$('#targetPresets [data-kb]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.kb) === s.targetKB);
    });

    $$('input[name="resizeMode"]').forEach((input) => {
      input.checked = input.value === s.resizeMode;
    });
    el.maxEdgeGroup.hidden = s.resizeMode !== 'max';
    el.boxGroup.hidden = s.resizeMode !== 'box';
    setInputIfIdle(el.maxEdge, s.maxEdge);
    setInputIfIdle(el.boxWidth, s.boxWidth);
    setInputIfIdle(el.boxHeight, s.boxHeight);
    $$('#maxEdgePresets [data-edge]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.edge) === s.maxEdge);
    });
    $$('#boxPresets [data-w]').forEach((button) => {
      button.classList.toggle(
        'is-active',
        Number(button.dataset.w) === s.boxWidth && Number(button.dataset.h) === s.boxHeight,
      );
    });

    el.keepAspect.checked = s.keepAspect;
    el.fitGroup.hidden = !s.keepAspect;
    el.positionGroup.hidden = !s.keepAspect;
    el.backgroundGroup.hidden = !s.keepAspect;
    el.stretchWarning.hidden = s.keepAspect;
    $$('input[name="fit"]').forEach((input) => {
      input.checked = input.value === (s.fit === 'cover' ? 'cover' : 'contain');
      input.disabled = !s.keepAspect;
    });

    el.positionLabel.textContent = POSITION_LABELS[s.position] || 'وسط';
    $$('.pos', el.positionGrid).forEach((button) => {
      const active = button.dataset.pos === s.position;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    });

    if (s.background === 'transparent') {
      el.bgColorLabel.textContent = 'شفاف';
      el.transparentButton.classList.add('is-active');
    } else {
      if (document.activeElement !== el.bgColor) el.bgColor.value = s.background;
      el.bgColorLabel.textContent = s.background.toUpperCase();
      el.transparentButton.classList.remove('is-active');
    }

    let boxHint = 'تصویر متناسب در کادر جای می‌گیرد و نواحی خالی با پس‌زمینه پر می‌شوند.';
    if (s.fit === 'cover' && s.keepAspect) {
      boxHint = 'تصویر برای پرکردن کادر برش می‌خورد؛ نسبت ابعاد حفظ می‌شود.';
    }
    if (s.keepAspect && s.fit !== 'cover' && !s.preserveAlpha && s.background === 'transparent') {
      boxHint = 'حفظ شفافیت خاموش است؛ نواحی خالی کادر سفید پر می‌شوند.';
    }
    el.boxHint.textContent = boxHint;
    el.backgroundHint.textContent = s.preserveAlpha ? 'برای نواحی خالی' : 'با شفافیت خاموش';

    el.preserveAlpha.checked = s.preserveAlpha;
    el.autoOrient.checked = s.autoOrient;
    el.iccSelect.value = s.icc;
    const iccHints = {
      srgb: 'رنگ‌ها با مدیریت درست پروفایل به sRGB تبدیل می‌شوند تا در همه‌جا یکسان دیده شوند.',
      keep: 'پروفایل رنگ اصلی حفظ می‌شود؛ روی نمایشگرهای مدیریت‌شده دقیق‌تر است.',
      strip: 'پروفایل رنگ حذف می‌شود؛ ممکن است رنگ‌ها کمی متفاوت دیده شوند.',
    };
    el.iccHint.textContent = iccHints[s.icc];

    el.stripMetadata.checked = s.metadata === 'strip';
    if (s.metadata === 'strip') {
      el.metadataNote.textContent =
        'با حذف متادیتا، اطلاعات مکانی احتمالی (GPS) و اطلاعات دوربین هم پاک می‌شود.';
      el.metadataNote.classList.remove('is-muted');
    } else {
      el.metadataNote.textContent =
        'متادیتای اصلی حفظ می‌شود؛ ممکن است موقعیت مکانی یا اطلاعات دوربین در فایل باقی بماند.';
      el.metadataNote.classList.add('is-muted');
    }

    setInputIfIdle(el.concurrencyRange, s.concurrency);
    el.concurrencyRange.style.setProperty('--p', `${((s.concurrency - 1) / 3) * 100}%`);
    el.concurrencyValue.textContent = `${fa.format(s.concurrency)} فایل`;
    const concurrencyHints = {
      1: 'پردازش تک‌به‌تک؛ کمترین فشار روی حافظه.',
      2: 'تعادل خوب بین سرعت و مصرف حافظه.',
      3: 'سریع‌تر برای سیستم‌های پرحافظه.',
      4: 'حداکثر سرعت؛ برای سیستم‌های پرحافظه و تصاویر کوچک بهتر است.',
    };
    el.concurrencyHint.textContent = concurrencyHints[s.concurrency];

    el.rejectLarger.checked = s.rejectLarger;
    el.replaceOriginal.checked = s.replaceOriginal;
    el.replaceRow.classList.toggle('is-active', s.replaceOriginal);
    el.replaceNote.hidden = !s.replaceOriginal;
    setInputIfIdle(el.maxInputMB, s.maxInputMB);
    setInputIfIdle(el.maxInputEdge, s.maxInputEdge);

    el.resetSettings.disabled = busy;
    el.applySettings.disabled = busy;
    if (busy) {
      el.applySettings.textContent = state.inspecting ? 'در حال بررسی…' : 'در حال پردازش…';
    } else if (!state.items.length) {
      el.applySettings.textContent = 'ذخیره تنظیمات';
    } else {
      el.applySettings.textContent = isDirty() ? 'اعمال و تبدیل' : 'تبدیل دوباره';
    }

    if (state.inspecting) {
      el.settingsHint.textContent = 'در حال خواندن تصاویر؛ یک لحظه صبر کن.';
    } else if (state.running) {
      el.settingsHint.textContent = 'در حال تبدیل؛ تنظیمات جدید بعد از پایان قابل اعمال است.';
    } else if (!state.items.length) {
      el.settingsHint.textContent = 'تنظیمات به‌صورت خودکار ذخیره می‌شود.';
    } else if (isDirty()) {
      el.settingsHint.textContent = 'تغییرات ذخیره شد؛ برای ساخت خروجی تازه «اعمال و تبدیل» را بزن.';
    } else {
      el.settingsHint.textContent = 'تنظیمات با خروجی فعلی همخوان است.';
    }

    el.staleBanner.hidden = !(isDirty() && !state.running && state.items.length > 0);
    updateSaveButtonLabel();
  }

  function bindNumber(input, key, min, max) {
    input.addEventListener('change', () => {
      const next = clampInt(input.value, state.settings[key], min, max);
      input.value = String(next);
      commitSettings({ [key]: next });
    });
  }

  function bindSwitch(input, key) {
    input.addEventListener('change', () => {
      commitSettings({ [key]: input.checked });
    });
  }

  function bindEvents() {
    $$('input[name="qualityMode"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) commitSettings({ qualityMode: input.value });
      });
    });
    bindNumber(el.targetKB, 'targetKB', 10, 5000);
    el.targetPresets.addEventListener('click', (event) => {
      const button = event.target.closest('[data-kb]');
      if (!button) return;
      const value = Number(button.dataset.kb);
      el.targetKB.value = String(value);
      commitSettings({ targetKB: value });
    });
    el.qualityRange.addEventListener('input', () => {
      commitSettings({ quality: Number(el.qualityRange.value) });
    });

    $$('input[name="resizeMode"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) commitSettings({ resizeMode: input.value });
      });
    });
    bindNumber(el.maxEdge, 'maxEdge', 64, 12000);
    el.maxEdgePresets.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edge]');
      if (!button) return;
      const value = Number(button.dataset.edge);
      el.maxEdge.value = String(value);
      commitSettings({ maxEdge: value });
    });
    bindNumber(el.boxWidth, 'boxWidth', 16, 8192);
    bindNumber(el.boxHeight, 'boxHeight', 16, 8192);
    el.boxPresets.addEventListener('click', (event) => {
      const button = event.target.closest('[data-w]');
      if (!button) return;
      const width = Number(button.dataset.w);
      const height = Number(button.dataset.h);
      el.boxWidth.value = String(width);
      el.boxHeight.value = String(height);
      commitSettings({ boxWidth: width, boxHeight: height });
    });
    el.keepAspect.addEventListener('change', () => {
      commitSettings({ keepAspect: el.keepAspect.checked });
    });
    $$('input[name="fit"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) commitSettings({ fit: input.value });
      });
    });
    el.positionGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.pos');
      if (!button) return;
      commitSettings({ position: button.dataset.pos });
    });
    el.bgColor.addEventListener('input', () => {
      commitSettings({ background: el.bgColor.value.toLowerCase() });
    });
    el.transparentButton.addEventListener('click', () => {
      commitSettings({ background: 'transparent' });
    });

    bindSwitch(el.preserveAlpha, 'preserveAlpha');
    bindSwitch(el.autoOrient, 'autoOrient');
    el.iccSelect.addEventListener('change', () => {
      commitSettings({ icc: el.iccSelect.value });
    });
    el.stripMetadata.addEventListener('change', () => {
      commitSettings({ metadata: el.stripMetadata.checked ? 'strip' : 'keep' });
    });

    el.concurrencyRange.addEventListener('input', () => {
      commitSettings({ concurrency: Number(el.concurrencyRange.value) });
    });
    bindSwitch(el.rejectLarger, 'rejectLarger');
    bindSwitch(el.replaceOriginal, 'replaceOriginal');
    bindNumber(el.maxInputMB, 'maxInputMB', 1, 200);
    bindNumber(el.maxInputEdge, 'maxInputEdge', 256, 20000);

    el.applySettings.addEventListener('click', handleApply);
    el.bannerApply.addEventListener('click', handleApply);
    el.resetSettings.addEventListener('click', resetSettings);
    el.addButton.addEventListener('click', pickFiles);
    el.queueAddButton.addEventListener('click', pickFiles);
    el.dropzone.addEventListener('click', pickFiles);
    el.dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pickFiles();
      }
    });

    el.removeButton.addEventListener('click', () => {
      const item = getSelectedItem();
      if (item) removeItem(item.id);
    });
    el.saveButton.addEventListener('click', saveSelected);
    el.saveAllButton.addEventListener('click', saveAll);
    el.reconvertButton.addEventListener('click', handleApply);
    el.cancelButton.addEventListener('click', cancelConversion);

    el.queue.addEventListener('click', (event) => {
      const node = event.target.closest('.queue-item');
      if (!node) return;
      const id = node.dataset.id;
      const action = event.target.closest('button[data-act]');
      if (action) {
        event.stopPropagation();
        const type = action.dataset.act;
        if (type === 'remove') removeItem(id);
        else if (type === 'retry') retryItem(id);
        else if (type === 'save') saveQueuedItem(id);
        return;
      }
      selectItem(id);
    });

    el.toastClose.addEventListener('click', hideToast);
    el.toastAction.addEventListener('click', () => {
      const handler = state.toastActionHandler;
      hideToast();
      if (typeof handler === 'function') handler();
    });

    el.instagramButton.addEventListener('click', async () => {
      try {
        if (api) await api.openInstagram();
      } catch {
        showToast({
          type: 'warning',
          title: 'باز کردن اینستاگرام ممکن نشد',
          message: 'instagram.com/mnabishahzamani',
        });
      }
    });

    el.githubButton.addEventListener('click', async () => {
      try {
        if (api) await api.openGithub();
      } catch {
        showToast({
          type: 'warning',
          title: 'باز کردن گیت‌هاب ممکن نشد',
          message: 'github.com/mnabishahzamani-dev',
        });
      }
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        pickFiles();
      }
      if (event.key === 'Escape') {
        hideToast();
        state.dragDepth = 0;
        el.dropOverlay.hidden = true;
      }
    });
  }

  function bindTabs() {
    const tabs = $$('.tab');
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
      tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowRight') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        activateTab(tabs[next].dataset.tab, true);
      });
    });
  }

  function activateTab(name, focus = false) {
    $$('.tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    $$('.panel').forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  }

  function bindCompare() {
    let dragging = false;

    const updateFromPointer = (event) => {
      const rect = el.compareStage.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = ((event.clientX - rect.left) / rect.width) * 100;
      setCompareSplit(ratio);
    };

    el.compareStage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      updateFromPointer(event);
      el.compareStage.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    window.addEventListener('pointermove', (event) => {
      if (dragging) updateFromPointer(event);
    });

    window.addEventListener('pointerup', () => {
      dragging = false;
    });
    window.addEventListener('pointercancel', () => {
      dragging = false;
    });

    el.compareStage.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        setCompareSplit(state.split - 4);
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        setCompareSplit(state.split + 4);
        event.preventDefault();
      } else if (event.key === 'Home') {
        setCompareSplit(0);
        event.preventDefault();
      } else if (event.key === 'End') {
        setCompareSplit(100);
        event.preventDefault();
      }
    });

    el.compareStage.addEventListener('dblclick', () => setCompareSplit(50));
  }

  function setCompareSplit(value) {
    const next = Math.min(100, Math.max(0, Number(value) || 0));
    state.split = next;
    el.compareStage.style.setProperty('--split', `${next}%`);
    el.compareStage.setAttribute('aria-valuenow', String(Math.round(next)));
  }

  function bindWindowControls() {
    $$('.win-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.win;
        if (!api) return;
        if (action === 'minimize') api.minimize();
        else if (action === 'maximize') api.toggleMaximize();
        else if (action === 'close') api.close();
      });
    });
    if (api) {
      api.onMaximizeChange((maximized) => {
        el.app.classList.toggle('is-maximized', Boolean(maximized));
      });
    }
  }

  function bindDragAndDrop() {
    const hasFiles = (event) =>
      Boolean(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files'));

    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      state.dragDepth += 1;
      el.dropOverlay.hidden = false;
    });

    window.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) el.dropOverlay.hidden = true;
    });

    window.addEventListener('drop', (event) => {
      event.preventDefault();
      const wasVisible = !el.dropOverlay.hidden;
      state.dragDepth = 0;
      el.dropOverlay.hidden = true;
      if (!hasFiles(event) || !api) return;
      if (wasVisible) {
        const files = Array.from(event.dataTransfer?.files || []);
        const paths = files.map((file) => api.getPathForFile(file)).filter(Boolean);
        if (paths.length) addPaths(paths);
        else {
          showToast({
            type: 'error',
            title: 'مسیر فایل خوانده نشد',
            message: 'از دکمهٔ انتخاب تصویر استفاده کن.',
          });
        }
      }
    });
  }

  /* ---------- add, inspect, convert ---------- */

  async function pickFiles() {
    if (!api) return;
    if (state.running || state.inspecting) {
      showToast({
        type: 'info',
        title: 'یک لحظه صبر کن',
        message: 'پردازش فعلی تمام نشده است.',
      });
      return;
    }
    try {
      const result = await api.pickFiles();
      if (!result || result.canceled) return;
      await addPaths(result.filePaths || []);
    } catch {
      showToast({
        type: 'error',
        title: 'انتخاب فایل انجام نشد',
        message: 'دوباره تلاش کن.',
      });
    }
  }

  async function addPaths(paths) {
    if (!api) return;
    if (state.running || state.inspecting) {
      showToast({
        type: 'info',
        title: 'یک لحظه صبر کن',
        message: 'پردازش فعلی تمام نشده است.',
      });
      return;
    }

    const incoming = [];
    let duplicates = 0;
    let unsupported = 0;
    let overflow = 0;
    const existing = new Set(state.items.map((item) => item.path.toLowerCase()));

    for (const rawPath of Array.isArray(paths) ? paths : []) {
      if (typeof rawPath !== 'string' || !rawPath.trim()) continue;
      const lower = rawPath.toLowerCase();
      const extension = lower.split('.').pop();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        unsupported += 1;
        continue;
      }
      if (existing.has(lower)) {
        duplicates += 1;
        continue;
      }
      if (state.items.length + incoming.length >= MAX_ITEMS) {
        overflow += 1;
        continue;
      }
      existing.add(lower);
      incoming.push(rawPath);
    }

    if (!incoming.length) {
      const parts = [];
      if (unsupported) parts.push('فرمت پشتیبانی‌نشده');
      if (duplicates) parts.push('فایل تکراری');
      if (overflow) parts.push(`سقف ${fa.format(MAX_ITEMS)} تصویر`);
      showToast({
        type: 'warning',
        title: 'تصویری اضافه نشد',
        message: parts.length ? `${parts.join('، ')} پیدا شد.` : 'فایلی انتخاب نشد.',
      });
      return;
    }

    if (unsupported || duplicates || overflow) {
      const parts = [];
      if (unsupported) parts.push(`${fa.format(unsupported)} فایل ناسازگار`);
      if (duplicates) parts.push(`${fa.format(duplicates)} فایل تکراری`);
      if (overflow) parts.push(`مازاد بر سقف ${fa.format(MAX_ITEMS)} تصویر`);
      showToast({
        type: 'warning',
        title: 'بعضی فایل‌ها نادیده گرفته شد',
        message: parts.join('، '),
      });
    }

    const wasDirty = isDirty();
    const newItems = incoming.map((filePath) => ({
      id: makeId(),
      path: filePath,
      name: baseName(filePath),
      status: 'inspecting',
      inspect: null,
      result: null,
      token: null,
      error: null,
      beforeUrl: null,
      afterUrl: null,
      thumbUrl: null,
      saved: false,
      savedPath: '',
    }));

    state.items.push(...newItems);
    if (!state.selectedId || !getSelectedItem()) state.selectedId = newItems[0].id;
    state.inspecting = true;

    renderViews();
    syncQueue();
    renderSummary();
    updateTotals();
    updateProgress();
    refreshBusyControls();
    refreshSettingsUI();

    try {
      const response = await api.inspectFiles(incoming, state.settings);
      if (!response || response.ok === false) {
        const message = response?.error?.message || 'بررسی تصاویر انجام نشد.';
        newItems.forEach((item) => {
          item.status = 'error';
          item.error = { code: 'UNKNOWN', message };
        });
      } else {
        const results = Array.isArray(response.items) ? response.items : [];
        results.forEach((info, index) => {
          const item = newItems[index];
          if (!item) return;
          if (info && info.ok) {
            item.inspect = info;
            item.status = 'pending';
            item.name = info.name || item.name;
            item.beforeUrl = makeObjectUrl(info.preview || info.thumb);
            item.thumbUrl = makeObjectUrl(info.thumb || info.preview);
          } else {
            item.status = 'error';
            item.error = info?.error || { code: 'UNREADABLE', message: 'این تصویر قابل خواندن نیست.' };
          }
        });
      }
    } catch {
      newItems.forEach((item) => {
        item.status = 'error';
        item.error = { code: 'UNKNOWN', message: 'ارتباط با موتور تصویر برقرار نشد.' };
      });
    } finally {
      state.inspecting = false;
    }

    const selected = getSelectedItem();
    if (!selected?.inspect) {
      const fallback = newItems.find((item) => item.inspect) || newItems.find((item) => item.error);
      if (fallback) state.selectedId = fallback.id;
    }

    syncQueue();
    renderSummary();
    updateTotals();
    refreshBusyControls();
    refreshSettingsUI();

    const targets = wasDirty
      ? state.items.filter((item) => item.inspect).map((item) => item.id)
      : state.items
          .filter((item) => item.inspect && !item.result && !item.token)
          .map((item) => item.id);

    if (targets.length) {
      await convertItems(targets);
    }
  }

  async function convertItems(ids) {
    if (!api || state.running || state.inspecting) return;

    const targets = [...new Set(ids)]
      .map((id) => getItem(id))
      .filter((item) => item && item.inspect);
    if (!targets.length) return;

    const settings = sanitizeSettings(state.settings);
    const runId = makeId();
    const runSignature = settingsSignature(settings);

    state.running = true;
    state.runId = runId;
    state.runSignature = runSignature;
    state.runTotal = targets.length;
    state.runSettled = 0;
    state.cancelRequested = false;

    for (const item of targets) {
      discardResult(item);
      item.error = null;
      item.status = 'pending';
    }

    syncQueue();
    renderSummary();
    updateTotals();
    updateProgress();
    refreshBusyControls();
    refreshSettingsUI();

    let cancelled = false;
    let fatalError = null;

    try {
      const response = await api.startConversion({
        runId,
        settings,
        items: targets.map((item) => ({ id: item.id, path: item.path })),
      });
      if (!response || response.ok === false) {
        fatalError = response?.error?.message || 'درخواست تبدیل پذیرفته نشد.';
      } else {
        cancelled = Boolean(response.cancelled);
      }
    } catch {
      fatalError = 'ارتباط با موتور پردازش قطع شد.';
    }

    if (state.runId !== runId) return;

    state.running = false;
    state.runId = null;
    state.appliedSignature = runSignature;

    for (const item of targets) {
      if (item.status === 'converting' || item.status === 'pending') {
        item.status = fatalError ? 'error' : 'pending';
        if (fatalError) item.error = { code: 'UNKNOWN', message: fatalError };
      }
    }

    const wasCancelled = cancelled || state.cancelRequested;
    state.cancelRequested = false;

    syncQueue();
    renderSummary();
    updateTotals();
    updateProgress();
    refreshBusyControls();
    refreshSettingsUI();

    if (fatalError) {
      showToast({
        type: 'error',
        title: 'تبدیل انجام نشد',
        message: fatalError,
      });
      return;
    }

    if (wasCancelled) {
      showToast({
        type: 'info',
        title: 'تبدیل متوقف شد',
        message: 'نتیجه‌های آماده‌شده در صف باقی ماندند.',
      });
      return;
    }

    const done = targets.filter((item) => item.status === 'done').length;
    const rejected = targets.filter((item) => item.status === 'rejected').length;
    const failed = targets.filter((item) => item.status === 'error').length;
    const outputBytes = targets.reduce((sum, item) => sum + (item.result?.bytes || 0), 0);

    if (done + rejected > 0) {
      showToast({
        type: failed ? 'warning' : 'success',
        title: done > 0
          ? `${fa.format(done)} تصویر آماده شد`
          : `${fa.format(rejected)} خروجی بزرگ‌تر رد شد`,
        message: failed
          ? `${fa.format(failed)} تصویر ناموفق · حجم خروجی‌ها ${formatBytes(outputBytes)}`
          : `حجم خروجی‌ها ${formatBytes(outputBytes)} · ${fa.format(targets.length)} تصویر`,
      });
    } else if (failed) {
      showToast({
        type: 'error',
        title: 'تبدیل انجام نشد',
        message: 'جزئیات خطا در صف نمایش داده می‌شود.',
      });
    }
  }

  async function cancelConversion() {
    if (!state.running || state.cancelRequested || !api) return;
    state.cancelRequested = true;
    refreshBusyControls();
    updateProgress();
    try {
      await api.cancelConversion(state.runId);
    } catch {
      /* the active run will finish on its own */
    }
  }

  function handleProgress(payload) {
    if (!payload || !state.running || payload.runId !== state.runId) return;
    const item = getItem(payload.id);
    if (!item) return;

    if (payload.type === 'item-start') {
      item.status = 'converting';
      item.error = null;
      syncQueueItem(item);
      if (state.selectedId === item.id) renderSummary();
      return;
    }

    if (payload.type === 'item-done' || payload.type === 'item-rejected') {
      item.status = payload.type === 'item-rejected' ? 'rejected' : 'done';
      item.token = payload.token || null;
      item.result = payload.result || null;
      item.error = null;
      item.saved = false;
      item.savedPath = '';
      if (item.afterUrl) revokeUrl(item.afterUrl);
      item.afterUrl = makeObjectUrl(payload.result?.preview);
      state.runSettled += 1;
    } else if (payload.type === 'item-error') {
      item.status = 'error';
      item.error = payload.error || { code: 'UNKNOWN', message: 'تبدیل این تصویر انجام نشد.' };
      item.token = null;
      item.result = null;
      if (item.afterUrl) revokeUrl(item.afterUrl);
      item.afterUrl = null;
      state.runSettled += 1;
    } else {
      return;
    }

    syncQueueItem(item);
    updateTotals();
    updateProgress();
    if (state.selectedId === item.id) renderSummary();
  }

  function discardResult(item) {
    if (item.token && api) api.releaseResults([item.token]);
    item.token = null;
    if (item.afterUrl) revokeUrl(item.afterUrl);
    item.afterUrl = null;
    item.result = null;
    item.saved = false;
    item.savedPath = '';
  }

  function releaseItem(item) {
    discardResult(item);
    if (item.beforeUrl) revokeUrl(item.beforeUrl);
    if (item.thumbUrl && item.thumbUrl !== item.beforeUrl) revokeUrl(item.thumbUrl);
    item.beforeUrl = null;
    item.thumbUrl = null;
  }

  function retryItem(id) {
    if (state.running || state.inspecting) return;
    const item = getItem(id);
    if (!item || !item.inspect) return;
    state.selectedId = id;
    syncQueue();
    renderSummary();
    const targets = isDirty()
      ? state.items.filter((entry) => entry.inspect).map((entry) => entry.id)
      : [id];
    convertItems(targets);
  }

  function removeItem(id) {
    if (state.running || state.inspecting) return;
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = state.items.splice(index, 1);
    releaseItem(item);
    const node = state.queueNodes.get(id);
    if (node) {
      node.remove();
      state.queueNodes.delete(id);
    }
    if (state.selectedId === id) {
      const next = state.items[index] || state.items[index - 1] || null;
      state.selectedId = next ? next.id : null;
    }
    renderViews();
    syncQueue();
    renderSummary();
    updateTotals();
    updateProgress();
    refreshBusyControls();
    refreshSettingsUI();
  }

  function selectItem(id) {
    if (!getItem(id)) return;
    state.selectedId = id;
    syncQueue();
    renderSummary();
  }

  /* ---------- saving ---------- */

  async function adoptSavedSources(pairs) {
    if (!api) return;
    const adopted = [];
    for (const pair of pairs) {
      const item = pair?.item || state.items.find((candidate) => candidate.token === pair?.token);
      if (!item || !pair?.filePath) continue;
      item.path = pair.filePath;
      item.savedPath = pair.filePath;
      const nextName = baseName(pair.filePath);
      if (nextName) item.name = nextName;
      adopted.push(item);
    }
    if (!adopted.length) return;

    try {
      const response = await api.inspectFiles(adopted.map((item) => item.path), state.settings);
      const results = Array.isArray(response?.items) ? response.items : [];
      results.forEach((info, index) => {
        const item = adopted[index];
        if (!item || !info?.ok) return;
        const oldBefore = item.beforeUrl;
        const oldThumb = item.thumbUrl;
        const nextBefore = makeObjectUrl(info.preview || info.thumb);
        const nextThumb = makeObjectUrl(info.thumb || info.preview);
        item.inspect = info;
        item.name = info.name || item.name;
        if (nextBefore) item.beforeUrl = nextBefore;
        if (nextThumb) item.thumbUrl = nextThumb;
        if (oldBefore) revokeUrl(oldBefore);
        if (oldThumb && oldThumb !== oldBefore) revokeUrl(oldThumb);
      });
    } catch {
      /* the saved file is still usable even if the refresh fails */
    }

    syncQueue();
    renderSummary();
  }

  async function saveSelected() {
    const item = getSelectedItem();
    if (!api || !item || !item.token || state.saving) return;

    state.saving = true;
    refreshBusyControls();
    try {
      const response = await api.saveResult(item.token, state.settings.replaceOriginal);
      if (!response || response.ok === false) {
        showToast({
          type: 'error',
          title: 'ذخیره انجام نشد',
          message: response?.error?.message || 'دوباره تلاش کن.',
        });
        return;
      }
      if (response.canceled) return;

      const filePath = response.filePaths?.[0] || '';
      item.saved = true;
      item.savedPath = filePath;
      if (response.trashed && filePath) await adoptSavedSources([{ item, filePath }]);
      syncQueueItem(item);
      renderSummary();

      const details = [];
      if (filePath) details.push(baseName(filePath));
      if (response.trashed) details.push('فایل اصلی به سطل بازیافت رفت');
      showToast({
        type: 'success',
        title: 'فایل WebP ذخیره شد',
        message: details.join(' · '),
        actionLabel: filePath ? 'نمایش فایل' : '',
        onAction: filePath ? () => api.revealPath(filePath) : null,
      });
    } catch {
      showToast({
        type: 'error',
        title: 'ذخیره انجام نشد',
        message: 'ارتباط با سیستم فایل برقرار نشد.',
      });
    } finally {
      state.saving = false;
      refreshBusyControls();
    }
  }

  async function saveAll() {
    const saveable = state.items.filter((item) => item.token);
    if (!api || !saveable.length || state.saving) return;

    state.saving = true;
    refreshBusyControls();
    try {
      const response = await api.saveAllResults(
        saveable.map((item) => item.token),
        state.settings.replaceOriginal,
      );
      if (!response || response.ok === false) {
        showToast({
          type: 'error',
          title: 'ذخیرهٔ همه انجام نشد',
          message: response?.error?.message || 'دوباره تلاش کن.',
        });
        return;
      }
      if (response.canceled) return;

      const savedEntries = Array.isArray(response.saved) ? response.saved : [];
      let marked = 0;
      const replaced = [];
      for (const entry of savedEntries) {
        const item = state.items.find((candidate) => candidate.token === entry.token);
        if (!item) continue;
        item.saved = true;
        item.savedPath = entry.filePath || '';
        marked += 1;
        if (entry.trashed && entry.filePath) {
          replaced.push({ token: entry.token, filePath: entry.filePath });
        }
      }

      if (replaced.length) await adoptSavedSources(replaced);

      const errorCount = Array.isArray(response.errors) ? response.errors.length : 0;
      syncQueue();
      renderSummary();
      updateTotals();

      if (marked) {
        const details = [];
        details.push(
          response.trashedCount
            ? `${fa.format(response.trashedCount)} فایل اصلی به سطل بازیافت رفت`
            : 'خروجی‌ها در پوشهٔ انتخابی ذخیره شدند',
        );
        if (errorCount) details.push(`${fa.format(errorCount)} فایل ذخیره نشد`);
        showToast({
          type: errorCount ? 'warning' : 'success',
          title: `${fa.format(marked)} فایل ذخیره شد`,
          message: details.join(' · '),
          actionLabel: response.folder ? 'نمایش پوشه' : '',
          onAction: response.folder ? () => api.revealPath(response.folder) : null,
        });
      } else {
        showToast({
          type: 'error',
          title: 'ذخیره انجام نشد',
          message: errorCount ? `${fa.format(errorCount)} فایل ذخیره نشد.` : 'دوباره تلاش کن.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'ذخیرهٔ همه انجام نشد',
        message: 'ارتباط با سیستم فایل برقرار نشد.',
      });
    } finally {
      state.saving = false;
      refreshBusyControls();
    }
  }

  async function saveQueuedItem(id) {
    const item = getItem(id);
    if (!item || !item.token) return;
    if (state.selectedId !== id) {
      state.selectedId = id;
      syncQueue();
      renderSummary();
    }
    await saveSelected();
  }

  async function handleApply() {
    if (state.running || state.inspecting) return;
    saveSettings();
    if (!state.items.length) {
      state.appliedSignature = settingsSignature(state.settings);
      refreshSettingsUI();
      showToast({
        type: 'success',
        title: 'تنظیمات ذخیره شد',
        message: 'حالا تصویرهایت را اضافه کن.',
      });
      return;
    }
    const ids = state.items.filter((item) => item.inspect).map((item) => item.id);
    if (!ids.length) {
      showToast({
        type: 'warning',
        title: 'تصویر آماده‌ای نیست',
        message: 'اول یک تصویر سالم اضافه کن.',
      });
      return;
    }
    await convertItems(ids);
  }

  function resetSettings() {
    if (state.running || state.inspecting) return;
    state.settings = sanitizeSettings(DEFAULT_SETTINGS);
    saveSettings();
    renderSettingsForm();
    if (state.items.length) {
      syncQueue();
      renderSummary();
    }
    showToast({
      type: 'info',
      title: 'تنظیمات پیش‌فرض برگشت',
      message: 'مقادیر امن و پیشنهادی دوباره فعال شد.',
    });
  }

  /* ---------- views ---------- */

  function renderViews() {
    const hasItems = state.items.length > 0;
    el.emptyView.hidden = hasItems;
    el.workspaceView.hidden = !hasItems;
    el.queueCard.hidden = !hasItems;
  }

  function syncQueue() {
    const ids = new Set(state.items.map((item) => item.id));
    for (const [id, node] of state.queueNodes) {
      if (!ids.has(id)) {
        node.remove();
        state.queueNodes.delete(id);
      }
    }

    state.items.forEach((item, index) => {
      let node = state.queueNodes.get(item.id);
      if (!node) {
        node = el.queueTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.id = item.id;
        state.queueNodes.set(item.id, node);
      }
      if (el.queue.children[index] !== node) {
        el.queue.insertBefore(node, el.queue.children[index] || null);
      }
      syncQueueItem(item);
    });

    el.queueCount.textContent = `${fa.format(state.items.length)} تصویر`;
  }

  function syncQueueItem(item) {
    const node = state.queueNodes.get(item.id);
    if (!node) return;

    const inspect = item.inspect;
    const result = item.result;
    node.classList.toggle('is-selected', item.id === state.selectedId);
    node.classList.toggle('is-saved', Boolean(item.saved));

    const name = item.name || inspect?.name || baseName(item.path);
    const nameNode = node.querySelector('.queue-item__name');
    nameNode.textContent = name;
    nameNode.title = item.path;

    let meta = '—';
    if (inspect) {
      meta = `${inspect.formatLabel} · ${formatDims(inspect.width, inspect.height)}`;
      if (inspect.animated) meta += ` · ${fa.format(inspect.pages)} فریم`;
    } else if (item.status === 'inspecting') {
      meta = 'در حال بررسی…';
    } else if (item.error) {
      meta = 'قابل خواندن نیست';
    }
    node.querySelector('.queue-item__meta').textContent = meta;

    setImageSource(node.querySelector('.queue-item__thumb img'), item.thumbUrl || item.beforeUrl);

    let sizes = '—';
    if (result) {
      sizes = `${formatSizeShort(result.sourceSize)} → ${formatSizeShort(result.bytes)}`;
    } else if (inspect) {
      sizes = formatSizeShort(inspect.size);
    }
    node.querySelector('.queue-item__sizes').textContent = sizes;

    const statusNode = node.querySelector('.queue-item__status');
    statusNode.dataset.status = item.status;
    statusNode.title = item.error?.message || result?.warning || '';
    node.querySelector('.queue-item__status-text').textContent = STATUS_LABELS[item.status] || '—';

    const savedNode = node.querySelector('.queue-item__saved');
    savedNode.hidden = !item.saved;
    savedNode.title = item.savedPath || 'ذخیره شد';

    const saveButton = node.querySelector('.queue-item__save');
    const removeButton = node.querySelector('.queue-item__remove');
    let mode = 'save';
    if (item.status === 'converting' || item.status === 'inspecting') mode = 'busy';
    else if (item.status === 'error' || item.status === 'pending') mode = 'retry';

    saveButton.dataset.mode = mode;
    saveButton.dataset.act = mode === 'retry' ? 'retry' : 'save';
    const canRetry = mode === 'retry' && Boolean(item.inspect);
    const canSave = mode === 'save' && Boolean(item.token);
    saveButton.disabled =
      state.running ||
      state.inspecting ||
      state.saving ||
      mode === 'busy' ||
      (!canRetry && !canSave);

    if (mode === 'busy') {
      saveButton.title = 'در حال پردازش…';
    } else if (mode === 'retry') {
      saveButton.title = item.inspect ? 'شروع دوبارهٔ تبدیل' : 'این فایل قابل خواندن نیست';
    } else if (item.token) {
      saveButton.title = item.saved ? 'ذخیرهٔ دوباره' : 'ذخیره WebP';
    } else if (result?.rejected) {
      saveButton.title = 'خروجی بزرگ‌تر از فایل اصلی است';
    } else {
      saveButton.title = 'خروجی آماده نیست';
    }

    removeButton.disabled = state.running || state.inspecting;
    removeButton.title = 'حذف از صف';
    removeButton.setAttribute('aria-label', `حذف ${name} از صف`);
  }

  function renderSummary() {
    const item = getSelectedItem();
    if (!item) {
      el.selectedName.textContent = '—';
      el.selectedInfo.textContent = '—';
      el.selectedMeta.textContent = 'تصویر را انتخاب کن';
      el.selectedBadges.replaceChildren();
      setImageSource(el.selectedThumb, null);
      setImageSource(el.beforeImage, null);
      setImageSource(el.afterImage, null);
      el.afterLayer.hidden = true;
      el.afterTag.hidden = true;
      el.beforeTag.hidden = true;
      el.compareDivider.hidden = true;
      el.compareState.hidden = true;
      el.compareError.hidden = true;
      el.saveState.hidden = true;
      el.resultNote.hidden = true;
      el.outSize.textContent = '—';
      el.outSub.textContent = '—';
      el.savings.textContent = '—';
      el.savingsSub.textContent = '—';
      el.outDims.textContent = '—';
      el.outQuality.textContent = '—';
      el.beforeDims.textContent = '—';
      el.afterDims.textContent = '—';
      updateSaveButtonLabel();
      updateSaveAllButton();
      return;
    }

    const inspect = item.inspect;
    const result = item.result;
    const displayName = item.name || inspect?.name || baseName(item.path);

    el.selectedName.textContent = displayName;
    el.selectedName.title = item.path;

    if (inspect) {
      const details = [
        inspect.formatLabel,
        formatBytes(inspect.size),
        formatDims(inspect.width, inspect.height),
      ];
      if (inspect.animated) details.push(`${fa.format(inspect.pages)} فریم`);
      el.selectedInfo.textContent = details.join(' · ');
      el.selectedMeta.textContent = `${displayName} · ${inspect.formatLabel} · ${formatBytes(inspect.size)}`;
    } else if (item.error) {
      el.selectedInfo.textContent = item.error.message;
      el.selectedMeta.textContent = displayName;
    } else if (item.status === 'inspecting') {
      el.selectedInfo.textContent = 'در حال خواندن اطلاعات تصویر…';
      el.selectedMeta.textContent = displayName;
    } else {
      el.selectedInfo.textContent = '—';
      el.selectedMeta.textContent = displayName;
    }

    setImageSource(el.selectedThumb, item.thumbUrl || item.beforeUrl);
    setImageSource(el.beforeImage, item.beforeUrl);
    setImageSource(el.afterImage, item.afterUrl);
    el.afterLayer.hidden = !item.afterUrl;
    el.afterTag.hidden = !item.afterUrl;
    el.beforeTag.hidden = !item.beforeUrl;
    el.compareDivider.hidden = !item.afterUrl;

    el.beforeDims.textContent = inspect ? formatDims(inspect.width, inspect.height) : '—';
    el.afterDims.textContent = result
      ? formatDims(result.width, result.height)
      : item.status === 'converting'
        ? 'در حال ساخت…'
        : '—';

    renderBadges(item);
    renderCompareState(item);

    if (result) {
      el.outSize.textContent = formatBytes(result.bytes);
      el.outSub.textContent = `از ${formatBytes(result.sourceSize)}`;
      const percent =
        result.sourceSize > 0 ? (1 - result.bytes / result.sourceSize) * 100 : 0;
      const negative = percent < -0.05;
      el.savings.textContent = `${negative ? '−' : ''}${faDecimal.format(Math.abs(percent))}٪`;
      el.savings.classList.toggle('is-negative', negative);
      el.savingsSub.textContent = negative
        ? 'خروجی از فایل اصلی بزرگ‌تر شد'
        : `${formatBytes(Math.abs(result.sourceSize - result.bytes))} کمتر`;
      el.outDims.textContent = formatDims(result.width, result.height);
      const qualityParts = [`کیفیت ${fa.format(result.quality)}`];
      qualityParts.push(
        result.scale < 0.995
          ? `مقیاس ${fa.format(Math.round(result.scale * 100))}٪`
          : 'ابعاد حفظ شد',
      );
      if (result.animated) qualityParts.push(`${fa.format(result.pages)} فریم`);
      el.outQuality.textContent = qualityParts.join(' · ');
      el.outQuality.title = result.durationMs
        ? `زمان پردازش: ${formatDuration(result.durationMs)}`
        : '';
    } else if (item.status === 'error') {
      el.outSize.textContent = '—';
      el.outSub.textContent = 'خطا در تبدیل';
      el.savings.textContent = '—';
      el.savings.classList.remove('is-negative');
      el.savingsSub.textContent = '—';
      el.outDims.textContent = '—';
      el.outQuality.textContent = '—';
    } else {
      el.outSize.textContent = '…';
      el.outSub.textContent =
        item.status === 'converting'
          ? 'در حال تبدیل'
          : item.status === 'pending'
            ? 'در انتظار'
            : 'در حال بررسی';
      el.savings.textContent = '…';
      el.savings.classList.remove('is-negative');
      el.savingsSub.textContent = '—';
      el.outDims.textContent = '…';
      el.outQuality.textContent = '—';
    }

    const note = pickResultNote(item);
    el.resultNote.hidden = !note;
    if (note) {
      el.resultNote.dataset.tone = note.tone;
      el.resultNote.textContent = note.text;
    }

    el.saveState.hidden = !item.saved;
    el.saveState.title = item.savedPath || '';
    updateSaveButtonLabel();
    updateSaveAllButton();
  }

  function pickResultNote(item) {
    if (item.error) return { tone: 'danger', text: item.error.message };
    if (item.result?.rejected) {
      return {
        tone: 'danger',
        text:
          item.result.warning ||
          'خروجی از فایل اصلی بزرگ‌تر شد و طبق تنظیمات رد شد. برای ذخیره، «رد خروجی بزرگ‌تر» را خاموش کن.',
      };
    }
    if (item.result?.warning) return { tone: 'warn', text: item.result.warning };
    if (item.saved) {
      return {
        tone: 'success',
        text: item.savedPath
          ? `در «${baseName(item.savedPath)}» ذخیره شد.`
          : 'خروجی ذخیره شد.',
      };
    }
    return null;
  }

  function renderBadges(item) {
    const badges = [];
    const inspect = item.inspect;
    if (inspect) {
      badges.push({ text: inspect.formatLabel || 'تصویر', tone: '' });
      if (inspect.animated) {
        badges.push({ text: `متحرک · ${fa.format(inspect.pages)} فریم`, tone: 'mint' });
      }
      if (inspect.hasAlpha) badges.push({ text: 'شفافیت', tone: 'peach' });
      if (inspect.hasProfile) badges.push({ text: 'پروفایل رنگ', tone: 'muted' });
      if (inspect.hasExif) badges.push({ text: 'EXIF', tone: 'muted' });
      if (inspect.warnings?.length) {
        badges.push({
          text: 'هشدار',
          tone: 'rose',
          title: inspect.warnings.map((warning) => warning.message).join(' '),
        });
      }
    }
    if (item.error) badges.push({ text: 'ناموفق', tone: 'rose' });
    if (item.result?.rejected) badges.push({ text: 'رد شد', tone: 'rose' });
    else if (item.result?.metTarget === false) badges.push({ text: 'هدف نشد', tone: 'rose' });

    const nodes = badges.map((badge) => {
      const node = document.createElement('span');
      node.className = `badge${badge.tone ? ` badge--${badge.tone}` : ''}`;
      node.textContent = badge.text;
      if (badge.title) node.title = badge.title;
      return node;
    });
    el.selectedBadges.replaceChildren(...nodes);
  }

  function renderCompareState(item) {
    const hasAfter = Boolean(item.afterUrl);
    const isError = item.status === 'error';
    el.compareError.hidden = !isError;

    if (isError) {
      el.compareState.hidden = true;
      el.compareErrorTitle.textContent = 'این تصویر تبدیل نشد';
      el.compareErrorMessage.textContent =
        item.error?.message || 'فایل قابل خواندن نیست یا از سقف‌های تعیین‌شده بزرگ‌تر است.';
      return;
    }

    el.compareState.hidden = hasAfter;
    if (hasAfter) return;

    let text = 'در حال آماده‌سازی…';
    let staticState = false;

    if (item.status === 'inspecting') {
      text = 'در حال خواندن تصویر…';
    } else if (item.status === 'converting') {
      text = 'در حال ساخت WebP…';
    } else if (item.status === 'pending') {
      if (state.running) {
        text = 'در صف تبدیل…';
      } else {
        text = 'برای تبدیل، تنظیمات را اعمال کن';
        staticState = true;
      }
    } else if (item.status === 'done' || item.status === 'rejected') {
      text = 'پیش‌نمایش خروجی در دسترس نیست';
      staticState = true;
    } else if (!item.inspect) {
      text = 'در انتظار تصویر…';
      staticState = true;
    }

    el.compareStateText.textContent = text;
    el.compareState.classList.toggle('is-static', staticState);
  }

  function updateSaveButtonLabel() {
    const item = getSelectedItem();
    const canSave =
      Boolean(item?.token) && !state.running && !state.inspecting && !state.saving;
    el.saveButton.disabled = !canSave;
    if (state.settings.replaceOriginal) {
      el.saveLabel.textContent = 'ذخیره و جایگزینی اصلی';
    } else if (item?.saved) {
      el.saveLabel.textContent = 'ذخیرهٔ دوباره';
    } else {
      el.saveLabel.textContent = 'ذخیره فایل WebP';
    }
  }

  function updateSaveAllButton() {
    const tokenCount = state.items.filter((item) => item.token).length;
    el.saveAllButton.hidden = state.items.length < 2;
    el.saveAllButton.disabled =
      tokenCount === 0 || state.running || state.inspecting || state.saving;
    el.saveAllLabel.textContent = tokenCount
      ? `ذخیره همه (${fa.format(tokenCount)})`
      : 'ذخیره همه';
  }

  function refreshBusyControls() {
    const busy = state.running || state.inspecting;
    el.addButton.disabled = busy || state.items.length >= MAX_ITEMS;
    el.queueAddButton.disabled = busy || state.items.length >= MAX_ITEMS;
    el.removeButton.disabled = busy;
    el.reconvertButton.hidden = state.running || state.items.length === 0;
    el.cancelButton.hidden = !state.running;
    el.cancelButton.disabled = state.cancelRequested;
    el.cancelButton.textContent = state.cancelRequested ? 'در حال توقف…' : 'توقف';
    for (const item of state.items) syncQueueItem(item);
    updateSaveButtonLabel();
    updateSaveAllButton();
  }

  function updateTotals() {
    const converted = state.items.filter((item) => item.result);
    if (!converted.length) {
      el.totalIn.textContent = '—';
      el.totalOut.textContent = '—';
      el.totalSaved.textContent = '—';
      el.totalSaved.classList.remove('is-negative');
      el.totalIn.title = '';
      el.totalOut.title = '';
      return;
    }

    let inputBytes = 0;
    let outputBytes = 0;
    for (const item of converted) {
      inputBytes += item.result.sourceSize || 0;
      outputBytes += item.result.bytes || 0;
    }
    const percent = inputBytes > 0 ? (1 - outputBytes / inputBytes) * 100 : 0;
    const negative = percent < -0.05;

    el.totalIn.textContent = formatSizeShort(inputBytes);
    el.totalOut.textContent = formatSizeShort(outputBytes);
    el.totalSaved.textContent = `${negative ? '−' : ''}${faDecimal.format(Math.abs(percent))}٪`;
    el.totalSaved.classList.toggle('is-negative', negative);
    el.totalIn.title = formatBytes(inputBytes);
    el.totalOut.title = formatBytes(outputBytes);
  }

  function updateProgress() {
    const active = state.running;
    el.queueProgress.hidden = !active;
    if (!active) {
      el.progressFill.style.width = '0%';
      el.progressLabel.textContent = '۰ از ۰';
      return;
    }
    const percent = state.runTotal
      ? Math.min(100, Math.round((state.runSettled / state.runTotal) * 100))
      : 0;
    el.progressFill.style.width = `${percent}%`;
    el.progressLabel.textContent = `${fa.format(state.runSettled)} از ${fa.format(state.runTotal)}`;
  }

  /* ---------- toast ---------- */

  function showToast({ type = 'success', title = '', message = '', actionLabel = '', onAction = null, duration = 5200 } = {}) {
    clearTimeout(state.toastAutoTimer);
    clearTimeout(state.toastHideTimer);

    el.toast.dataset.type = type;
    el.toastTitle.textContent = title;
    el.toastMessage.textContent = message;
    el.toastAction.hidden = !actionLabel;
    el.toastAction.textContent = actionLabel || '';
    state.toastActionHandler = typeof onAction === 'function' ? onAction : null;

    el.toast.hidden = false;
    requestAnimationFrame(() => {
      el.toast.classList.add('is-visible');
    });

    state.toastAutoTimer = setTimeout(hideToast, duration);
  }

  function hideToast() {
    clearTimeout(state.toastAutoTimer);
    clearTimeout(state.toastHideTimer);
    el.toast.classList.remove('is-visible');
    state.toastHideTimer = setTimeout(() => {
      if (!el.toast.classList.contains('is-visible')) el.toast.hidden = true;
    }, 260);
  }
})();
