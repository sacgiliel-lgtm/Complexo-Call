'use client';

import { useEffect } from 'react';

const IMAGE_SRC = '/fundo-login.jpg';
const FALLBACK = {
  accent: [156, 92, 255],
  accent2: [237, 25, 114],
  accent3: [54, 216, 137],
};

function rgb(values) {
  return values.join(' ');
}

function scoreColor(color, count) {
  const max = Math.max(color[0], color[1], color[2]) / 255;
  const min = Math.min(color[0], color[1], color[2]) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
  if (luminance < 0.08 || luminance > 0.96) return 0;
  return count * (0.35 + saturation * 1.55);
}

function distance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function extractPalette(image) {
  const canvas = document.createElement('canvas');
  const size = 56;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return FALLBACK;
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 16) {
    const r = Math.min(255, Math.round(data[i] / 32) * 32);
    const g = Math.min(255, Math.round(data[i + 1] / 32) * 32);
    const b = Math.min(255, Math.round(data[i + 2] / 32) * 32);
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const candidates = [...buckets.entries()]
    .map(([key, count]) => ({ color: key.split(',').map(Number), count }))
    .sort((a, b) => scoreColor(b.color, b.count) - scoreColor(a.color, a.count));
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.every((entry) => distance(entry, candidate.color) > 58)) chosen.push(candidate.color);
    if (chosen.length === 3) break;
  }
  return {
    accent: chosen[0] || FALLBACK.accent,
    accent2: chosen[1] || FALLBACK.accent2,
    accent3: chosen[2] || FALLBACK.accent3,
  };
}

export default function CpxPalette() {
  useEffect(() => {
    let cancelled = false;
    const apply = (palette) => {
      if (cancelled) return;
      const root = document.documentElement;
      root.style.setProperty('--cpx-accent-rgb', rgb(palette.accent));
      root.style.setProperty('--cpx-accent-2-rgb', rgb(palette.accent2));
      root.style.setProperty('--cpx-accent-3-rgb', rgb(palette.accent3));
      root.style.setProperty('--cpx-accent', `rgb(${rgb(palette.accent)})`);
      root.style.setProperty('--cpx-accent-2', `rgb(${rgb(palette.accent2)})`);
      root.style.setProperty('--cpx-accent-3', `rgb(${rgb(palette.accent3)})`);
    };

    apply(FALLBACK);
    const image = new window.Image();
    image.decoding = 'async';
    image.onload = () => {
      try { apply(extractPalette(image)); } catch { apply(FALLBACK); }
    };
    image.onerror = () => apply(FALLBACK);
    image.src = IMAGE_SRC;
    return () => { cancelled = true; };
  }, []);

  return null;
}
