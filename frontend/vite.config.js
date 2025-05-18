import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 1️⃣ Tell the React plugin to transform JSX in .js/.jsx/.ts/.tsx
  plugins: [
    react({
      // globs of files to include in the JSX transform
      include: '**/*.{js,jsx,ts,tsx}',
      // use the new automatic runtime (recommended)
      jsxRuntime: 'automatic'
    })
  ],

  // 2️⃣ Instruct Vite’s internal ESBuild to parse all your source as JSX
  esbuild: {
    // match all JS/JSX/TS/TSX under src/
    include: /src\/.*\.[jt]sx?$/,
    // treat them as JSX
    loader: 'jsx'
  },

  // 3️⃣ Ensure dependency pre‐bundling also knows .js/.jsx => JSX
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

  // 4️⃣ Make sure imports without extensions still resolve
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },

  // keep your existing server/public/base settings
  server: {
    port: 5173
  },
  publicDir: 'public',
  base: '/'
})
