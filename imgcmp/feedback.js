// 反馈渠道：应用内弹窗 → FormSubmit（免服务器）→ 开发者邮箱
// 无需密钥、无需登录，三平台（网页/uTools/桌面）共用一份代码
(function () {
  'use strict'

  const VERSION = '1.1.0'
  // FormSubmit ajax 端点：直接 POST 即转发到开发者邮箱，首次提交需邮箱确认一次
  const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/xzh2190615611@163.com'

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

    const payload = {
      _subject: `[图片对比] ${type} · ${platformName()} v${VERSION}`,
      type,
      message,
      contact: contact || '未填写',
      platform: platformName(),
      version: VERSION,
      _template: 'table',
      _captcha: 'false',
      _honey: '' // honeypot：自动填充者为机器人，FormSubmit 会拦截
    }

    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data && data.success === 'true') {
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
