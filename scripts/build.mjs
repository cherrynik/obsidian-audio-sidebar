import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  legalComments: 'none',
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  loader: { '.svg': 'text' },
  external: ['obsidian'],
  outfile: 'dist/main.js',
  write: false
});
const license = readFileSync('node_modules/plyr/LICENSE.md', 'utf8').trim();
writeFileSync('dist/main.js', `/*\n${license}\n*/\n${result.outputFiles[0].text}`);
writeFileSync('dist/styles.css', `${readFileSync('node_modules/plyr/dist/plyr.css', 'utf8')}\n${readFileSync('src/styles.css', 'utf8')}`);
copyFileSync('manifest.json', 'dist/manifest.json');
