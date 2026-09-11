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
          sirv(assetsDir, {
            dev: true,
            etag: false,
            maxAge: 0,
            single: false
          })
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
          const files = fs.readdirSync(modelsDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(modelsDir, d.name, 'model.vrm')))
            .map(d => d.name)

          const metadata = Object.fromEntries(
            files.map(name => {
              const metaPath = path.join(modelsDir, name, 'metadata.json')
              const meta = fs.existsSync(metaPath)
                ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                : {}
              return [name, meta]
            }),
          )

          return `export const VRM_FILES = ${JSON.stringify(files)}
        export const VRM_METADATA = ${JSON.stringify(metadata)}`
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
    }
  }
})