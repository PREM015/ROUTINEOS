/**
 * Color manipulation utilities (pure functions).
 * Colors are represented as hex strings (`#rrggbb`) or structured RGB/HSL objects.
 */

import { randomColor } from './random';

export { randomColor };

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Check whether a string looks like a hex color (3 or 6 digits, `#` optional).
 * @example isHex('#a1b2c3') // true
 */
export function isHex(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

/**
 * Parse a hex color string into an { r, g, b } tuple. Returns null for invalid input.
 * Supports both 3-digit (#abc) and 6-digit (#aabbcc) forms.
 * @example hexToRgb('#ff8800') // { r: 255, g: 136, b: 0 }
 */
export function hexToRgb(hex: string): RgbColor | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1] ?? '';
  const expanded = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/**
 * Convert an { r, g, b } tuple to a `#rrggbb` hex string.
 * Component values are clamped to 0-255.
 * @example rgbToHex({ r: 255, g: 136, b: 0 }) // '#ff8800'
 */
export function rgbToHex(rgb: RgbColor): string {
  const toHex = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Build an `rgba(...)` CSS string from an RGB tuple + optional alpha (0-1).
 * @example toRgbaString({ r: 255, g: 0, b: 0 }, 0.5) // 'rgba(255, 0, 0, 0.5)'
 */
export function toRgbaString(rgb: RgbColor, alpha?: number): string {
  if (alpha === undefined) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Convert a hex color into an `rgb()` / `rgba()` string.
 * @example hexToRgba('#ff0000') // 'rgb(255, 0, 0)'
 */
export function hexToRgba(hex: string, alpha?: number): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? toRgbaString(rgb, alpha) : null;
}

/**
 * Lighten a hex color by `amount` (0-1), blending it toward white.
 * @example lighten('#880000', 0.5) // '#c04040'
 */
export function lighten(hex: string, amount: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const factor = Math.min(1, Math.max(0, amount));
  const blend = (value: number): number => Math.round(value + (255 - value) * factor);
  return rgbToHex({ r: blend(rgb.r), g: blend(rgb.g), b: blend(rgb.b) });
}

/**
 * Darken a hex color by `amount` (0-1), blending it toward black.
 * @example darken('#aaffaa', 0.5) // '#558055'
 */
export function darken(hex: string, amount: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const factor = Math.min(1, Math.max(0, amount));
  const scale = (value: number): number => Math.round(value * (1 - factor));
  return rgbToHex({ r: scale(rgb.r), g: scale(rgb.g), b: scale(rgb.b) });
}

/**
 * Convert a hex color to HSL. `h` in [0, 360], `s`/`l` as percentages [0, 100].
 * @example hexToHsl('#ff0000') // { h: 0, s: 100, l: 50 }
 */
export function hexToHsl(hex: string): HslColor | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to a `#rrggbb` hex string. `h` in [0, 360], `s`/`l` as percentages.
 * @example hslToHex({ h: 0, s: 100, l: 50 }) // '#ff0000'
 */
export function hslToHex(hsl: HslColor): string {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, hsl.s)) / 100;
  const l = Math.min(100, Math.max(0, hsl.l)) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgbToHex({
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  });
}

/**
 * Pick black or white text for best contrast against a background color
 * using WCAG relative luminance.
 * @example getContrastText('#ffffff') // '#000000'
 */
export function getContrastText(background: string | RgbColor): string {
  const rgb: RgbColor | null =
    typeof background === 'string' ? hexToRgb(background) : background;
  if (!rgb) return '#000000';
  const linearize = (value: number): number => {
    const channel = Math.min(255, Math.max(0, value)) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
  return luminance > 0.5 ? '#000000' : '#ffffff';
}