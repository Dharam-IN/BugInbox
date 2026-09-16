import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'));

// The widget is published under a major-version path. Republishing the same
// path is how owners receive fixes without editing their websites, so the URL
// is deliberately mutable: no integrity claim is made about it.
const major = pkg.version.split('.')[0];
const outDir = join(here, 'dist', `v${major}`);

await rm(join(here, 'dist'), { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [join(here, 'src', 'index.ts')],
  outfile: join(outDir, 'buginbox.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome96', 'firefox98', 'safari15', 'edge96'],
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  define: { __BUGINBOX_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `/* BugInbox widget v${pkg.version} */`,
  },
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
await writeFile(join(here, 'dist', 'VERSION'), `${pkg.version}\n`, 'utf8');
console.log(`Built widget v${pkg.version} -> dist/v${major}/buginbox.js (${(bytes / 1024).toFixed(1)} KiB minified)`);
