// Bundles src/ (and three.js) into ../assets/board3d/board3d.html: one self-contained page the
// app loads into a WebView (no network, no file loading).
import { build } from 'esbuild';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// The character models (models/*.glb) are embedded as base64 so the page needs no files.
const models = {};
for (const f of readdirSync('models').filter((f) => f.endsWith('.glb'))) {
  models[f.replace('.glb', '')] = readFileSync('models/' + f).toString('base64');
}
writeFileSync('src/models_data.gen.js', 'export default ' + JSON.stringify(models) + ';\n');

const out = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  write: false,
  legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>OpenRook board</title>
<!-- Built from app/board3d (npm run build). three.js is MIT licensed: https://threejs.org -->
<style>html,body{margin:0;height:100%;overflow:hidden;background:#15110e;touch-action:none;-webkit-user-select:none;user-select:none}canvas{display:block}</style>
</head><body><script>${js}</script></body></html>
`;
mkdirSync('../assets/board3d', { recursive: true });
writeFileSync('../assets/board3d/board3d.html', html);
console.log(`board3d.html: ${(html.length / 1024).toFixed(0)} KB`);
