import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  legalComments: 'none',
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  external: ['obsidian'],
  outfile: 'dist/main.js',
  write: false
});
writeFileSync('dist/main.js', result.outputFiles[0].text);
writeFileSync('dist/styles.css', readFileSync('src/styles.css', 'utf8'));
copyFileSync('manifest.json', 'dist/manifest.json');
