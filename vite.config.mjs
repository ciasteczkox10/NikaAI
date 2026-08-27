import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import sirv from 'sirv'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.resolve(__dirname, 'assets')
const configDir = path.resolve(__dirname, 'config')

export default defineConfig({
  root: 'frontend',

  resolve: {
    alias: {
      '@config': configDir
    }
  },

  plugins: [
    {
      name: 'serve-assets',
      configureServer(server) {
        server.middlewares.use(
          '/assets',
          sirv(assetsDir)
        )

        server.watcher.add(assetsDir)
        server.watcher.on('change', (file) => {
          if (file.startsWith(assetsDir)) {
            server.ws.send({ type: 'full-reload' })
          }
        })
        server.watcher.on('add', (file) => {
          if (file.startsWith(assetsDir)) {
            server.ws.send({ type: 'full-reload' })
          }
        })
        server.watcher.on('unlink', (file) => {
          if (file.startsWith(assetsDir)) {
            server.ws.send({ type: 'full-reload' })
          }
        })
      }
    },
    {
      name: 'vrm-models-list',
      resolveId(id) {
        if (id === 'virtual:vrm-models') return '\0virtual:vrm-models'
      },
      load(id) {
        if (id === '\0virtual:vrm-models') {
          const modelsDir = path.join(assetsDir, 'models')
          const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.vrm'))
          return `export const VRM_FILES = ${JSON.stringify(files)}`
        }
      },
      configureServer(server) {
        const modelsDir = path.join(assetsDir, 'models')
        server.watcher.add(modelsDir)
        server.watcher.on('all', (event, file) => {
          if (file.startsWith(modelsDir)) {
            const mod = server.moduleGraph.getModuleById('\0virtual:vrm-models')
            if (mod) server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        })
      }
    }
  ],

  server: {
    fs: {
      allow: [__dirname]
    },
    watch: {
      ignored: ['**/.venv/**'],
      usePolling: true,
    }
  }
})