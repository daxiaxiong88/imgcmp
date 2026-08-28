// 打包/开发前拷贝插件核心文件到 web/（Tauri 的 frontendDist 指向这里）
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'imgcmp')
const DEST = path.join(__dirname, 'web')

const FILES = [
  'index.html',
  'app.js',
  'style.css',
  'platform.js',
  'utools.adapter.js',
  'tauri.adapter.js',
  'logo.png'
]

fs.rmSync(DEST, { recursive: true, force: true })
fs.mkdirSync(DEST, { recursive: true })
for (const f of FILES) {
  fs.copyFileSync(path.join(SRC, f), path.join(DEST, f))
}
console.log('已拷贝 ' + FILES.length + ' 个文件到 web/')
