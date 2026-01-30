import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'BikeEventsDashboard',
      formats: ['es'],
      fileName: () => 'bike-events.js'
    },
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: 'bike-events.[ext]'
      }
    },
    cssCodeSplit: false,
    minify: 'esbuild'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    postcss: './postcss.config.js'
  }
})
