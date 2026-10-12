import fs from 'fs';
import path from 'path';

export const ROOT = process.cwd();
export const USER_DATA_DIR = path.join(ROOT, 'user-data');
export const SHARED_DATA_DIR = path.join(ROOT, 'data');

export const readJson = (file, fallback) => {
  if (!fs.existsSync(file)) return fallback;
  const text = fs.readFileSync(file, 'utf8');
  return text.trim() ? JSON.parse(text) : fallback;
};

// Write to a temp file then rename so a crash can't leave a half-written file.
export const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

export const relPath = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

const pad = (n) => String(n).padStart(2, '0');

export const timestamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const localDateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
