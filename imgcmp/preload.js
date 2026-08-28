if (typeof uTools !== 'undefined') {
  Object.defineProperty(window, 'uToolsBridge', {
    value: {
      onPluginEnter(cb) {
        uTools.onPluginEnter(cb)
      },
      onPluginOut(cb) {
        uTools.onPluginOut(cb)
      },
      dbStorage: {
        setItem(key, value) {
          return uTools.dbStorage.setItem(key, value)
        },
        getItem(key) {
          return uTools.dbStorage.getItem(key)
        },
        removeItem(key) {
          return uTools.dbStorage.removeItem(key)
        }
      },
      showConfirm(text) {
        return uTools.showConfirm(text)
      },
      showSaveDialog(options) {
        return uTools.showSaveDialog(options)
      },
      copyText(text) {
        return uTools.copyText(text)
      },
      getPath(key) {
        return uTools.getPath(key)
      },
      toast(type, text) {
        if (typeof uTools.toast === 'function') {
          uTools.toast(text)
          return
        }
        return uTools.toast(type, text)
      }
    },
    writable: false
  })
} else {
  window.uToolsBridge = null
}