// Prepara os arquivos do MediaPipe para serem servidos pelo próprio app (sem CDN em tempo de execução):
//  - copia o runtime WASM de node_modules para public/mediapipe/wasm
//  - baixa os modelos .task oficiais para public/models (só na primeira vez)
// Roda sozinho antes de `npm run dev` e `npm run build`.

import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkgDir = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const wasmDst = path.join(root, 'public', 'mediapipe', 'wasm');
const modelsDst = path.join(root, 'public', 'models');

const MODELS = [
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  const { version } = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const stamp = path.join(wasmDst, '.version');
  if ((await exists(stamp)) && (await readFile(stamp, 'utf8')).trim() === version) return;

  await mkdir(wasmDst, { recursive: true });
  const src = path.join(pkgDir, 'wasm');
  for (const name of await readdir(src)) await copyFile(path.join(src, name), path.join(wasmDst, name));
  await writeFile(stamp, version);
  console.log(`[setup] WASM do MediaPipe ${version} copiado para public/mediapipe/wasm`);
}

async function downloadModels() {
  await mkdir(modelsDst, { recursive: true });
  for (const { file, url } of MODELS) {
    const dst = path.join(modelsDst, file);
    if (await exists(dst)) continue;
    console.log(`[setup] baixando ${file}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dst + '.part', buf);
    await rename(dst + '.part', dst);
    console.log(`[setup] ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
}

await copyWasm();
await downloadModels();
