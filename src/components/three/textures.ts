"use client";
import * as THREE from "three";

/**
 * Procedural canvas textures (no external assets). Created lazily and cached.
 */
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  cache.set(key, tex);
  return tex;
}

/** Corrugated cladding: vertical ribs with soft shading. */
export function corrugatedTexture(base = "#2f6fe4") {
  return canvasTexture(`corr-${base}`, 64, 64, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(0.45, "rgba(255,255,255,0.02)");
      g.addColorStop(0.55, "rgba(0,0,0,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0.02)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 8, 64);
    }
  });
}

/** Roof panels with seams and skylight strips. */
export function roofTexture() {
  return canvasTexture("roof", 256, 256, (ctx) => {
    ctx.fillStyle = "#4a83ec";
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 6) {
      ctx.fillStyle = x % 12 === 0 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(x, 0, 3, 256);
    }
    ctx.fillStyle = "rgba(225,240,255,0.85)";
    for (let y = 40; y < 256; y += 64) ctx.fillRect(20, y, 216, 10);
  });
}

/** Dock roll-up door slats. */
export function doorTexture() {
  return canvasTexture("door", 64, 64, (ctx) => {
    ctx.fillStyle = "#e8edf5";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 6) {
      ctx.fillStyle = "rgba(15,23,42,0.12)";
      ctx.fillRect(0, y, 64, 1.5);
    }
  });
}

/** Office windows band. */
export function windowsTexture() {
  return canvasTexture("windows", 256, 128, (ctx) => {
    ctx.fillStyle = "#f4f7fb";
    ctx.fillRect(0, 0, 256, 128);
    for (let row = 0; row < 2; row++) {
      for (let x = 8; x < 256; x += 32) {
        const g = ctx.createLinearGradient(x, 0, x + 26, 40);
        g.addColorStop(0, "#9cc1f5");
        g.addColorStop(1, "#4f86d9");
        ctx.fillStyle = g;
        ctx.fillRect(x, 14 + row * 64, 24, 34);
      }
    }
  });
}

/** Trailer side livery with a word mark. */
export function trailerTexture(label: string, stripe: string) {
  return canvasTexture(`trailer-${label}-${stripe}`, 512, 128, (ctx) => {
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 96, 512, 14);
    ctx.fillStyle = stripe;
    ctx.font = "bold 46px Inter, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 150, 52);
    // simple cube mark
    ctx.save();
    ctx.translate(95, 52);
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(26, -15);
    ctx.lineTo(26, 15);
    ctx.lineTo(0, 30);
    ctx.lineTo(-26, 15);
    ctx.lineTo(-26, -15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

/** Container side with ribs and carrier name. */
export function containerTexture(color: string, label: string) {
  return canvasTexture(`cont-${color}-${label}`, 256, 96, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 96);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, 0, 2, 96);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 4, 0, 2, 96);
    }
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 22px Inter, Arial, sans-serif";
    ctx.fillText(label, 16, 34);
  });
}

/** Cardboard with tape strip — used on cargo boxes. */
export function cardboardTexture() {
  return canvasTexture("cardboard", 64, 64, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(120,80,30,0.10)";
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 1);
    ctx.fillStyle = "rgba(200,170,120,0.55)";
    ctx.fillRect(28, 0, 8, 64);
  });
}

/** Asphalt with subtle grain. */
export function asphaltTexture() {
  return canvasTexture(
    "asphalt",
    128,
    128,
    (ctx) => {
      ctx.fillStyle = "#c9d2df";
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
      }
    },
    [24, 24],
  );
}
