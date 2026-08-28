(function () {
  'use strict'

  function createBrowserPlatform() {
    return {
      name: 'browser',
      canReadPath: false,
      canSaveToPath: false,

      async readFileAsDataURL() {
        throw new Error('当前平台不支持按路径读取文件')
      },

      confirm(text) {
        return Promise.resolve(window.confirm(text))
      },

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
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 3000)
        return { saved: true, path: filename }
      },

      onEnterImages() {}
    }
  }

  function detectPlatform() {
    // Tauri 桌面版（withGlobalTauri 先于页面脚本注入 window.__TAURI__）
    if (typeof window.createTauriPlatform === 'function' && window.__TAURI__) {
      return window.createTauriPlatform()
    }
    if (typeof window.createUToolsPlatform === 'function' && window.uToolsBridge) {
      return window.createUToolsPlatform()
    }
    return createBrowserPlatform()
  }

  window.platform = detectPlatform()
})()
