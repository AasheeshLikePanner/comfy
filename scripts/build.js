import * as esbuild from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

await esbuild.build({
  entryPoints: [join(rootDir, 'src', 'cli.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: join(rootDir, 'dist', 'cli.js'),
  format: 'esm',
  sourcemap: false,
  minify: false,
  external: ['pg', 'net', 'child_process', 'fs', 'path', 'url', 'os', 'open'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});

console.log('✓ CLI bundled with esbuild');
