(function () {
  'use strict'

  function createUToolsPlatform() {
    const bridge = window.uToolsBridge

    const enter = { images: null, command: null }
    // uTools 只允许注册一个 onPluginEnter，这里统一分发：
    // 反馈命令（imgcmp-feedback）直接唤起反馈弹窗，其余按图片载荷处理
    bridge.onPluginEnter(payload => {
      const code = payload && payload.code
      if (code === 'imgcmp-feedback') {
        if (enter.command) enter.command()
        return
      }
      if (enter.images) {
        const items = (payload && Array.isArray(payload.payload)) ? payload.payload : []
        const paths = []
        for (const it of items) {
          if (it && it.path) paths.push(it.path)
          else if (it && it.dataURL) paths.push(it.dataURL)
          else if (typeof it === 'string') paths.push(it)
        }
        if (paths.length) enter.images(paths)
      }
    })

    const platform = {
      name: 'utools',
      canReadPath: true,
      canSaveToPath: true,

      readFileAsDataURL(path) {
        const MIME = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
          svg: 'image/svg+xml', ico: 'image/x-icon'
        }
        return new Promise((resolve, reject) => {
          try {
            const fs = require('fs')
            fs.readFile(path, (err, data) => {
              if (err) { reject(err); return }
              const ext = path.split('.').pop().toLowerCase()
              const mime = MIME[ext] || 'image/png'
              resolve(`data:${mime};base64,${data.toString('base64')}`)
            })
          } catch (e) { reject(e) }
        })
      },

      confirm(text) {
        return Promise.resolve(bridge.showConfirm(text))
      },

      storage: {
        get(key) {
          return bridge.dbStorage.getItem(key)
        },
        set(key, value) {
          return bridge.dbStorage.setItem(key, value)
        },
        remove(key) {
          return bridge.dbStorage.removeItem(key)
        }
      },

      async saveBlob(blob, filename) {
        if (!bridge.showSaveDialog) return { saved: false, path: null }
        const ext = (filename.split('.').pop() || 'png').toLowerCase()
        const result = bridge.showSaveDialog({
          title: '保存对比图',
          defaultPath: filename,
          filters: [{ name: ext === 'jpg' ? 'JPEG 图片' : 'PNG 图片', extensions: [ext] }]
        })
        // uTools 可能返回 { canceled, filePath } 对象或直接路径字符串，两种都兼容
        const filePath = result && typeof result === 'object' ? result.filePath : (typeof result === 'string' ? result : '')
        if (!filePath) return { saved: false, path: null }
        const ab = await blob.arrayBuffer()
        const fs = require('fs')
        await fs.promises.writeFile(filePath, Buffer.from(ab))
        return { saved: true, path: filePath }
      },

      onEnterImages(cb) {
        enter.images = cb
      },

      onCommand(cb) {
        enter.command = cb
      }
    }

    return platform
  }

  window.createUToolsPlatform = createUToolsPlatform
})()
