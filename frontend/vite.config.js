import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{js,jsx,ts,tsx}',
      jsxRuntime: 'automatic'
    })
  ],
  esbuild: {
    include: /src\/.*\.[jt]sx?$/,
    loader: 'jsx'
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.ts': 'ts',
        '.tsx': 'tsx'
      }
    }
  },
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  server: {
    port: 5173
  },
  publicDir: 'public',
  base: './',
  build: {
    outDir: 'build'
  }
})
