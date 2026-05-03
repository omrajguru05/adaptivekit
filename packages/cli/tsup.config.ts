import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    treeshake: true,
  },
  {
    entry: { cli: 'src/bin.ts' },
    format: ['cjs'],
    dts: false,
    sourcemap: false,
    clean: false,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    treeshake: true,
  },
])
