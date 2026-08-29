// 反馈渠道：应用内弹窗 → EmailJS（免服务器）→ 开发者邮箱
// EmailJS 不分来源环境（file:// uTools、tauri:// 桌面、网页均可用），三平台共用一份代码
(function () {
  'use strict'

  const VERSION = '1.1.0'
  // EmailJS 凭据：Service/Template/PublicKey 均来自 emailjs.com 控制台
  const EMAILJS_SERVICE_ID = 'service_ul6dnf3'
  const EMAILJS_TEMPLATE_ID = 'template_a4aay1g'
  const EMAILJS_PUBLIC_KEY = 'MzdMWNlywYzumjBdJ'
  const EMAILJS_SDK = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'

  const $ = sel => document.querySelector(sel)

  function toast(text) {
    const old = document.querySelector('.toast')
    if (old) old.remove()
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = text
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1800)
  }

  function platformName() {
    return (window.platform && window.platform.name) || 'browser'
  }

  function open() {
    const modal = $('#feedback-modal')
    if (modal) modal.hidden = false
  }

  // 供外部（如 uTools 命令入口）直接唤起反馈弹窗
  window.openFeedback = open

  function close() {
    const modal = $('#feedback-modal')
    if (modal) modal.hidden = true
  }

  // 按需加载 EmailJS SDK：仅在用户点击提交时加载，避免页面启动时多一次网络请求
  function ensureEmailJS() {
    return new Promise((resolve, reject) => {
      if (window.emailjs) { resolve(); return }
      const s = document.createElement('script')
      s.src = EMAILJS_SDK
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('SDK 加载失败'))
      document.head.appendChild(s)
    })
  }

  async function submit() {
    const message = $('#fb-message').value.trim()
    if (!message) {
      toast('请填写反馈内容')
      return
    }
    const type = $('#fb-type').value
    const contact = $('#fb-contact').value.trim()
    const btn = $('#fb-submit')
    btn.disabled = true
    btn.textContent = '提交中…'

    // 参数名与 EmailJS 模板里的 {{...}} 占位符一一对应
    const params = {
      subject: `[图片对比] ${type} · ${platformName()} v${VERSION}`,
      type,
      message,
      contact: contact || '未填写',
      platform: platformName(),
      version: VERSION
    }

    try {
      await ensureEmailJS()
      const res = await window.emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        params,
        { publicKey: EMAILJS_PUBLIC_KEY }
      )
      if (res && res.status === 200) {
        toast('反馈已发送，感谢你的支持！')
        $('#fb-message').value = ''
        $('#fb-contact').value = ''
        close()
      } else {
        toast('发送失败，请稍后重试')
      }
    } catch (e) {
      toast('发送失败，请检查网络后重试')
    } finally {
      btn.disabled = false
      btn.textContent = '提交'
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#feedback-btn').addEventListener('click', open)
    $('#fb-cancel').addEventListener('click', close)
    $('#fb-submit').addEventListener('click', submit)
    $('#feedback-modal').addEventListener('click', e => {
      if (e.target.id === 'feedback-modal') close()
    })
  })
})()
