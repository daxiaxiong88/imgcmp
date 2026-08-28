(function () {
  'use strict'

  // Tauri 桌面版适配器：通过 withGlobalTauri 注入的 window.__TAURI__ 调用 Rust 命令
  function createTauriPlatform() {
    const invoke = window.__TAURI__.core.invoke

    return {
      name: 'tauri',
      canReadPath: true,
      canSaveToPath: true,

      readFileAsDataURL(path) {
        return invoke('read_image', { path: path })
      },

      confirm(text) {
        return invoke('confirm', { text: text })
      },

      // WebView2 的 localStorage 同步可用且随应用持久（与 browser 适配器同实现）
      storage: {
        get(key) {
          const raw = window.localStorage.getItem(key)
          return raw == null ? null : raw
        },
        set(key, value) {
          window.localStorage.setItem(key, value)
        },
        remove(key) {
          window.localStorage.removeItem(key)
        }
      },

      async saveBlob(blob, filename) {
        const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg' }
        const ext = EXT[blob.type] || 'png'
        const base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader()
          fr.onload = () => resolve(fr.result.split(',')[1])
          fr.onerror = reject
          fr.readAsDataURL(blob)
        })
        return await invoke('save_blob', { name: filename, data: base64, ext: ext })
      },

      onEnterImages() {
        // 桌面版无宿主推送入口，图片通过界面添加或拖放
      }
    }
  }

  window.createTauriPlatform = createTauriPlatform
})()
