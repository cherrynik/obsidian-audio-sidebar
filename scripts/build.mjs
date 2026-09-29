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
  loader: { '.svg': 'text' },
  external: ['obsidian'],
  outfile: 'main.js',
  write: false
});

const license = readFileSync('node_modules/plyr/LICENSE.md', 'utf8').trim();
const bundledCode = result.outputFiles[0].text;
writeFileSync('main.js', `/*\n${license}\n*/\n${bundledCode}`);
const baseStyle = readFileSync('node_modules/plyr/dist/plyr.css', 'utf8');
const customStyle = readFileSync('src/styles.css', 'utf8');
writeFileSync('styles.css', `${baseStyle}\n${customStyle}`);
