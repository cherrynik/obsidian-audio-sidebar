import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  legalComments: 'none',
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  external: ['obsidian'],
  outfile: 'main.js',
  write: false
});

const license = readFileSync('node_modules/howler/LICENSE.md', 'utf8').trim();
const bundledCode = result.outputFiles[0].text;
writeFileSync('main.js', `/*\n${license}\n*/\n${bundledCode}`);
