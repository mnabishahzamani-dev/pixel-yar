'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const bmp = require('bmp-js');
const sharp = require('sharp');

sharp.cache({ memory: 64, files: 0, items: 100 });
sharp.concurrency(2);

const HARD_LIMITS = {
  maxFrames: 200,
  maxAnimationPixels: 50_000_000,
  maxStillPixels: 100_000_000,
  maxOutputBytes: 150 * 1024 * 1024,
};

const IMAGE_EXTENSIONS = [
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
];

const ALLOWED_EXTENSIONS = new Set(IMAGE_EXTENSIONS.map((extension) => `.${extension}`));
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif', 'bmp']);
const ANIMATED_FORMATS = new Set(['gif', 'webp', 'heif']);
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

const FORMAT_LABELS = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  tiff: 'TIFF',
  heif: 'AVIF',
  bmp: 'BMP',
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

class ImageError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
    this.details = details;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberIn(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(Math.round(number), min, max);
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeSettings(input = {}) {
  const qualityMode = input.qualityMode === 'manual' ? 'manual' : 'target';
  const keepAspect = input.keepAspect !== false;
  let fit = oneOf(input.fit, ['contain', 'cover'], 'contain');
  if (!keepAspect) fit = 'stretch';

  const background =
    typeof input.background === 'string' && /^(#[0-9a-f]{3}|#[0-9a-f]{6}|transparent)$/i.test(input.background)
      ? input.background.toLowerCase()
      : DEFAULT_SETTINGS.background;

  return {
    qualityMode,
    targetKB: numberIn(input.targetKB, DEFAULT_SETTINGS.targetKB, 10, 5000),
    quality: numberIn(input.quality, DEFAULT_SETTINGS.quality, 30, 100),
    resizeMode: oneOf(input.resizeMode, ['none', 'max', 'box'], DEFAULT_SETTINGS.resizeMode),
    maxEdge: numberIn(input.maxEdge, DEFAULT_SETTINGS.maxEdge, 64, 12000),
    boxWidth: numberIn(input.boxWidth, DEFAULT_SETTINGS.boxWidth, 16, 8192),
    boxHeight: numberIn(input.boxHeight, DEFAULT_SETTINGS.boxHeight, 16, 8192),
    keepAspect,
    fit,
    position: oneOf(input.position, [...POSITIONS], DEFAULT_SETTINGS.position),
    background,
    preserveAlpha: input.preserveAlpha !== false,
    autoOrient: input.autoOrient !== false,
    icc: oneOf(input.icc, ['srgb', 'keep', 'strip'], DEFAULT_SETTINGS.icc),
    metadata: input.metadata === 'keep' ? 'keep' : 'strip',
    rejectLarger: input.rejectLarger === true,
    concurrency: numberIn(input.concurrency, DEFAULT_SETTINGS.concurrency, 1, 4),
    replaceOriginal: input.replaceOriginal === true,
    maxInputMB: numberIn(input.maxInputMB, DEFAULT_SETTINGS.maxInputMB, 1, 200),
    maxInputEdge: numberIn(input.maxInputEdge, DEFAULT_SETTINGS.maxInputEdge, 256, 20000),
  };
}

function parseHexColor(value, fallback) {
  if (value === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || ''));
  if (!match) return fallback;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((digit) => digit + digit).join('');
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    alpha: 1,
  };
}

function solidBackground(settings) {
  const color = parseHexColor(settings.background, { r: 255, g: 255, b: 255, alpha: 1 });
  return color.alpha === 0 ? { r: 255, g: 255, b: 255, alpha: 1 } : color;
}

function contentBackground(settings) {
  if (!settings.preserveAlpha) return solidBackground(settings);
  return parseHexColor(settings.background, { r: 0, g: 0, b: 0, alpha: 0 });
}

function isOrientable(orientation) {
  return orientation >= 5 && orientation <= 8;
}

function extensionOf(filePath) {
  return path.extname(filePath).toLowerCase();
}

function friendlySharpError(error) {
  const message = String(error?.message || '');
  if (/Input file is missing|ENOENT|no such file/i.test(message)) {
    return new ImageError('NOT_FOUND', 'فایل پیدا نشد یا جابه‌جا شده است.');
  }
  if (/unsupported image format|Input buffer contains unsupported image format/i.test(message)) {
    return new ImageError('UNREADABLE', 'این فایل یک تصویر معتبر نیست.');
  }
  if (/Input image exceeds pixel limit|limitInputPixels/i.test(message)) {
    return new ImageError('INPUT_TOO_LARGE', 'ابعاد تصویر بیش از حد مجاز است.');
  }
  if (/timeout|Timeout/i.test(message)) {
    return new ImageError('TIMEOUT', 'پردازش این تصویر بیش از حد طول کشید.');
  }
  return new ImageError('UNREADABLE', 'این تصویر قابل خواندن نیست.', { technical: message });
}

function decodeBmp(rawBuffer) {
  let decoded;
  try {
    decoded = bmp.decode(rawBuffer);
  } catch {
    throw new ImageError('UNREADABLE', 'فایل BMP معتبر نیست یا از نوع پشتیبانی‌شده نیست.');
  }

  const { width, height, data } = decoded;
  if (!width || !height || !data?.length) {
    throw new ImageError('UNREADABLE', 'ابعاد فایل BMP معتبر نیست.');
  }

  // bmp-js returns ABGR bytes; sharpen requires RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = data[index + 3];
    rgba[index + 1] = data[index + 2];
    rgba[index + 2] = data[index + 1];
    rgba[index + 3] = 255;
  }

  return { data: rgba, width, height };
}

async function decodeBmpFile(filePath) {
  const raw = await fs.readFile(filePath);
  return decodeBmp(raw);
}

function openSharp(source, { animated = false, pages = undefined } = {}) {
  if (source.kind === 'raw') {
    return sharp(source.data, {
      raw: { width: source.width, height: source.height, channels: 4 },
      failOn: 'error',
    });
  }

  return sharp(source.path, {
    failOn: 'error',
    animated,
    pages: pages ?? (animated ? -1 : 1),
    limitInputPixels: HARD_LIMITS.maxStillPixels,
  });
}

function animationDelay(info) {
  if (!Array.isArray(info.delays) || info.delays.length === 0) return undefined;
  if (info.delays.length === info.pages) return info.delays;
  return info.delays[0];
}

function validateSource(info, settings) {
  if (info.size > settings.maxInputMB * 1024 * 1024) {
    throw new ImageError(
      'FILE_TOO_LARGE',
      `حجم فایل بیش از سقف ${settings.maxInputMB} مگابایتی ورودی است.`,
    );
  }

  if (Math.max(info.width, info.frameHeight) > settings.maxInputEdge) {
    throw new ImageError(
      'INPUT_TOO_LARGE',
      `بلندترین ضلع تصویر بیش از سقف ${settings.maxInputEdge} پیکسلی است.`,
    );
  }

  if (info.animated) {
    if (info.pages > HARD_LIMITS.maxFrames) {
      throw new ImageError(
        'ANIMATION_TOO_LARGE',
        `تصویر متحرک ${info.pages} فریم دارد؛ حداکثر ${HARD_LIMITS.maxFrames} فریم پشتیبانی می‌شود.`,
      );
    }

    const totalPixels = info.width * info.frameHeight * info.pages;
    if (totalPixels > HARD_LIMITS.maxAnimationPixels) {
      throw new ImageError(
        'ANIMATION_TOO_LARGE',
        'مجموع پیکسل‌های فریم‌های این انیمیشن بیش از حد مجاز است.',
      );
    }
  } else {
    const pixels = info.width * info.height;
    if (pixels > HARD_LIMITS.maxStillPixels) {
      throw new ImageError('INPUT_TOO_LARGE', 'تعداد پیکسل‌های تصویر بیش از حد مجاز است.');
    }
  }

  if (Math.max(info.width, info.frameHeight) * Math.max(info.width, info.frameHeight) >
      HARD_LIMITS.maxStillPixels * 4) {
    throw new ImageError('INPUT_TOO_LARGE', 'ابعاد تصویر بیش از حد مجاز است.');
  }
}

async function readSource(filePath) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new ImageError('NOT_FOUND', 'فایل پیدا نشد یا در دسترس نیست.');
  }

  if (!stat.isFile()) {
    throw new ImageError('NOT_A_FILE', 'مسیر انتخاب‌شده یک فایل نیست.');
  }

  const extension = extensionOf(filePath);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ImageError('UNSUPPORTED_FORMAT', 'این فرمت تصویر پشتیبانی نمی‌شود.');
  }

  const common = {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    extension,
  };

  if (extension === '.bmp') {
    const bmpSource = await decodeBmpFile(filePath);
    return {
      ...common,
      kind: 'raw',
      source: { kind: 'raw', data: bmpSource.data, width: bmpSource.width, height: bmpSource.height },
      format: 'bmp',
      width: bmpSource.width,
      height: bmpSource.height,
      frameHeight: bmpSource.height,
      pages: 1,
      animated: false,
      hasAlpha: false,
      hasProfile: false,
      hasExif: false,
      orientation: 1,
      loop: 0,
      delays: undefined,
      warnings: [],
    };
  }

  let metadata;
  try {
    metadata = await openSharp({ kind: 'path', path: filePath }, { animated: false }).metadata();
  } catch (error) {
    throw friendlySharpError(error);
  }

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new ImageError('UNSUPPORTED_FORMAT', 'این فرمت تصویر پشتیبانی نمی‌شود.');
  }

  const rawPages = Number(metadata.pages) || 1;
  const animated = rawPages > 1 && ANIMATED_FORMATS.has(metadata.format);

  if (animated) {
    try {
      metadata = await openSharp({ kind: 'path', path: filePath }, { animated: true }).metadata();
    } catch (error) {
      throw friendlySharpError(error);
    }
  }

  const pages = animated ? Math.max(rawPages, Number(metadata.pages) || 1) : 1;
  const frameHeight = animated
    ? metadata.pageHeight || (metadata.height % pages === 0 ? metadata.height / pages : metadata.height)
    : metadata.height;

  if (!metadata.width || !frameHeight) {
    throw new ImageError('UNREADABLE', 'ابعاد این تصویر قابل تشخیص نیست.');
  }

  const warnings = [];
  if (!animated && rawPages > 1) {
    warnings.push({
      code: 'multipage-first-page',
      message: 'این فایل چندصفحه‌ای است؛ فقط صفحهٔ اول تبدیل می‌شود.',
    });
  }

  const info = {
    ...common,
    kind: 'path',
    source: { kind: 'path', path: filePath },
    format: metadata.format,
    width: metadata.width,
    height: animated ? frameHeight : metadata.height,
    frameHeight,
    pages,
    animated,
    hasAlpha: Boolean(metadata.hasAlpha),
    hasProfile: Boolean(metadata.hasProfile || metadata.icc),
    hasExif: Boolean(metadata.exif),
    orientation: Number(metadata.orientation) || 1,
    loop: Number.isFinite(metadata.loop) ? metadata.loop : 0,
    delays: Array.isArray(metadata.delay) ? metadata.delay : undefined,
    warnings,
  };

  return info;
}

function orientedDimensions(info, autoOrient = true) {
  if (autoOrient && isOrientable(info.orientation)) {
    return { width: info.frameHeight, height: info.width };
  }
  return { width: info.width, height: info.height };
}

function previewOptions(info, quality = 74) {
  const options = {
    quality,
    effort: info.animated ? 3 : 4,
    smartSubsample: true,
  };
  if (info.animated) {
    options.loop = info.loop;
    const delay = animationDelay(info);
    if (delay !== undefined) options.delay = delay;
  }
  return options;
}

async function makePreviews(info) {
  let thumb = null;
  let preview = null;

  try {
    thumb = await openSharp(info.source, { animated: false })
      .rotate()
      .resize(144, 144, { fit: 'cover', position: 'centre' })
      .withIccProfile('srgb')
      .webp({ quality: 70, effort: 3, smartSubsample: true })
      .timeout({ seconds: 40 })
      .toBuffer();
  } catch {
    thumb = null;
  }

  try {
    preview = await openSharp(info.source, { animated: info.animated })
      .rotate()
      .resize({
        width: 1000,
        height: 1000,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      })
      .withIccProfile('srgb')
      .webp(previewOptions(info))
      .timeout({ seconds: 60 })
      .toBuffer();
  } catch {
    preview = null;
  }

  return { thumb, preview };
}

async function inspectFile(filePath, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  const info = await readSource(filePath);
  validateSource(info, settings);

  const display = orientedDimensions(info, true);
  const previews = await makePreviews(info);

  return {
    ok: true,
    path: info.path,
    name: info.name,
    size: info.size,
    format: info.format,
    formatLabel: FORMAT_LABELS[info.format] || String(info.format).toUpperCase(),
    width: display.width,
    height: display.height,
    rawWidth: info.width,
    rawHeight: info.height,
    pages: info.pages,
    animated: info.animated,
    hasAlpha: info.hasAlpha,
    hasProfile: info.hasProfile,
    hasExif: info.hasExif,
    orientation: info.orientation,
    warnings: info.warnings,
    thumb: previews.thumb,
    preview: previews.preview,
  };
}

function buildResize(info, settings, scale) {
  if (settings.resizeMode === 'max') {
    const edge = Math.max(32, Math.round(settings.maxEdge * scale));
    return {
      width: edge,
      height: edge,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    };
  }

  if (settings.resizeMode === 'box') {
    if (!settings.keepAspect) {
      return {
        width: settings.boxWidth,
        height: settings.boxHeight,
        fit: 'fill',
        kernel: 'lanczos3',
      };
    }

    if (settings.fit === 'cover') {
      return {
        width: settings.boxWidth,
        height: settings.boxHeight,
        fit: 'cover',
        position: settings.position,
        kernel: 'lanczos3',
      };
    }

    return {
      width: settings.boxWidth,
      height: settings.boxHeight,
      fit: 'contain',
      position: settings.position,
      background: contentBackground(settings),
      kernel: 'lanczos3',
    };
  }

  if (scale < 0.999) {
    const oriented = orientedDimensions(info, settings.autoOrient);
    return {
      width: Math.max(16, Math.round(oriented.width * scale)),
      height: Math.max(16, Math.round(oriented.height * scale)),
      fit: 'fill',
      kernel: 'lanczos3',
    };
  }

  return null;
}

function createEncoder(info, settings) {
  return function encode(scale, quality) {
    let pipeline = openSharp(info.source, {
      animated: info.animated,
      pages: info.animated ? -1 : 1,
    });

    if (settings.autoOrient) pipeline = pipeline.rotate();

    const resize = buildResize(info, settings, scale);
    if (resize) pipeline = pipeline.resize(resize);

    if (!settings.preserveAlpha) {
      pipeline = pipeline.flatten({ background: solidBackground(settings) });
    }

    if (settings.metadata === 'keep') {
      pipeline = pipeline.keepExif().keepXmp();
    }

    if (settings.icc === 'srgb') {
      pipeline = pipeline.withIccProfile('srgb');
    } else if (settings.icc === 'keep') {
      pipeline = pipeline.keepIccProfile();
    }

    const webpOptions = {
      quality,
      alphaQuality: clamp(Math.round(quality), 50, 100),
      effort: info.animated ? 3 : 4,
      smartSubsample: true,
    };

    if (info.animated) {
      webpOptions.loop = info.loop;
      const delay = animationDelay(info);
      if (delay !== undefined) webpOptions.delay = delay;
    }

    return pipeline
      .webp(webpOptions)
      .timeout({ seconds: 90 })
      .toBuffer();
  };
}

function ensureNotCancelled(shouldCancel) {
  if (shouldCancel()) {
    throw new ImageError('CANCELLED', 'پردازش لغو شد.');
  }
}

async function findBestForTarget(encode, settings, info, shouldCancel) {
  const targetBytes = settings.targetKB * 1000;
  const minQuality = 42;
  const maxQuality = 95;
  const fixedCanvas = settings.resizeMode === 'box';
  let scale = 1;
  let bestFallback = null;

  for (let pass = 0; pass < 6; pass += 1) {
    ensureNotCancelled(shouldCancel);

    const lowBuffer = await encode(scale, minQuality);
    ensureNotCancelled(shouldCancel);
    if (!bestFallback || lowBuffer.length < bestFallback.buffer.length) {
      bestFallback = { buffer: lowBuffer, quality: minQuality, scale };
    }

    if (lowBuffer.length > targetBytes) {
      if (fixedCanvas || scale <= 0.06) {
        return {
          ...bestFallback,
          metTarget: false,
          warning: fixedCanvas
            ? 'در ابعاد دقیق انتخاب‌شده، رسیدن به حجم هدف ممکن نشد. ابعاد کادر یا حجم هدف را تغییر بده.'
            : 'رسیدن به حجم هدف با کیفیت قابل‌قبول ممکن نشد.',
        };
      }

      const factor = clamp(Math.sqrt(targetBytes / lowBuffer.length) * 0.97, 0.4, 0.9);
      const nextScale = scale * factor;
      if (nextScale <= 0.06) {
        return {
          ...bestFallback,
          metTarget: false,
          warning: 'رسیدن به حجم هدف با کیفیت قابل‌قبول ممکن نشد.',
        };
      }
      scale = nextScale;
      continue;
    }

    const highBuffer = await encode(scale, maxQuality);
    ensureNotCancelled(shouldCancel);
    if (highBuffer.length <= targetBytes) {
      return { buffer: highBuffer, quality: maxQuality, scale, metTarget: true, warning: null };
    }

    let lowQuality = minQuality;
    let highQuality = maxQuality;
    let best = { buffer: lowBuffer, quality: minQuality, scale };
    const steps = info.animated ? 4 : 5;

    for (let step = 0; step < steps; step += 1) {
      const quality = Math.round((lowQuality + highQuality) / 2);
      if (quality <= lowQuality || quality >= highQuality) break;

      const candidate = await encode(scale, quality);
      ensureNotCancelled(shouldCancel);

      if (candidate.length <= targetBytes) {
        best = { buffer: candidate, quality, scale };
        lowQuality = quality;
      } else {
        highQuality = quality;
      }
    }

    return { ...best, metTarget: true, warning: null };
  }

  return {
    ...bestFallback,
    metTarget: false,
    warning: 'رسیدن به حجم هدف با کیفیت قابل‌قبول ممکن نشد.',
  };
}

async function makeResultPreview(buffer, animated, info) {
  if (buffer.length <= 800 * 1024) return buffer;

  try {
    let pipeline = sharp(buffer, {
      animated,
      failOn: 'error',
      pages: animated ? -1 : 1,
      limitInputPixels: HARD_LIMITS.maxStillPixels,
    }).resize({
      width: 1100,
      height: 1100,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    });

    const options = {
      quality: 76,
      effort: 3,
      smartSubsample: true,
    };

    if (animated) {
      const metadata = await pipeline.metadata();
      options.loop = Number.isFinite(metadata.loop) ? metadata.loop : 0;
      if (Array.isArray(metadata.delay) && metadata.delay.length) options.delay = metadata.delay;
    }

    return await pipeline.webp(options).timeout({ seconds: 60 }).toBuffer();
  } catch {
    return null;
  }
}

async function convertFile(filePath, rawSettings, options = {}) {
  const settings = normalizeSettings(rawSettings);
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
  const startedAt = Date.now();

  const info = await readSource(filePath);
  validateSource(info, settings);
  ensureNotCancelled(shouldCancel);

  const encode = createEncoder(info, settings);
  let chosen;
  let metTarget = null;
  let warning = null;

  if (settings.qualityMode === 'manual') {
    const buffer = await encode(1, settings.quality);
    ensureNotCancelled(shouldCancel);
    chosen = { buffer, quality: settings.quality, scale: 1 };
  } else {
    const best = await findBestForTarget(encode, settings, info, shouldCancel);
    chosen = best;
    metTarget = best.metTarget;
    warning = best.warning || null;
  }

  if (chosen.buffer.length > HARD_LIMITS.maxOutputBytes) {
    throw new ImageError('OUTPUT_TOO_LARGE', 'حجم خروجی بیش از حد مجاز است.');
  }

  const outMeta = await sharp(chosen.buffer, {
    animated: info.animated,
    failOn: 'error',
    limitInputPixels: HARD_LIMITS.maxStillPixels,
  }).metadata();

  const outPages = Number(outMeta.pages) || 1;
  const outAnimated = outPages > 1;
  const outFrameHeight = outAnimated
    ? outMeta.pageHeight || (outMeta.height % outPages === 0 ? outMeta.height / outPages : outMeta.height)
    : outMeta.height;

  const rejected = settings.rejectLarger && chosen.buffer.length >= info.size;
  const preview = await makeResultPreview(chosen.buffer, outAnimated, info);

  if (rejected) {
    warning = `خروجی (${Math.ceil(chosen.buffer.length / 1024)} کیلوبایت) از فایل اصلی بزرگ‌تر است و ذخیره نشد.`;
  }

  return {
    ok: true,
    rejected,
    buffer: chosen.buffer,
    preview,
    sourceSize: info.size,
    sourceFormat: info.format,
    sourceWidth: info.width,
    sourceHeight: info.height,
    sourceAnimated: info.animated,
    bytes: chosen.buffer.length,
    width: outMeta.width,
    height: outFrameHeight,
    pages: outPages,
    animated: outAnimated,
    quality: chosen.quality,
    scale: chosen.scale,
    targetBytes: settings.qualityMode === 'target' ? settings.targetKB * 1000 : null,
    metTarget,
    warning,
    durationMs: Date.now() - startedAt,
    metadataStripped: settings.metadata !== 'keep',
    icc: settings.icc,
    preserveAlpha: settings.preserveAlpha,
    filename: path.basename(filePath),
    sourcePath: filePath,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  HARD_LIMITS,
  IMAGE_EXTENSIONS,
  ImageError,
  convertFile,
  inspectFile,
  normalizeSettings,
  readSource,
};
