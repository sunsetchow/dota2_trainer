import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sourceFirstResolve = {
  extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
}

export default defineConfig({
  main: {
    resolve: sourceFirstResolve,
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: 'electron/main.ts',
        external: ['electron-store'],
        output: {
          format: 'cjs',
          entryFileNames: 'main.js',
        },
      },
    },
  },
  preload: {
    resolve: sourceFirstResolve,
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: 'electron/preload.ts',
        output: {
          format: 'cjs',
          entryFileNames: 'preload.js',
        },
      },
    },
  },
  renderer: {
    root: '.',
    resolve: sourceFirstResolve,
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react()],
  },
})
