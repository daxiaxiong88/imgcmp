(function () {
  'use strict'

  const STORAGE_KEY = 'imgcmp:last-project'

  const FONTS = {
    sans: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
    serif: '"Source Han Serif SC", "Noto Serif CJK SC", "SimSun", serif',
    yahei: '"Microsoft YaHei", "PingFang SC", sans-serif',
    pingfang: '"PingFang SC", "DengXian", sans-serif',
    times: '"Times New Roman", "Times", "Source Han Serif SC", serif',
    mono: '"JetBrains Mono", "Cascadia Code", Consolas, monospace'
  }

  // 面板标号：按期刊格式生成第 i 个面板（0 起）的标号文字
  // lower=a（Nature）、upper=A（Cell/PNAS）、paren=(a)（IEEE）、parenUpper=(A)（ACS）
  function panelLabelText(i) {
    const fmt = state.panelLabel
    if (fmt === 'none') return ''
    let n = i + 1, s = ''
    while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) }
    if (fmt === 'upper') return s.toUpperCase()
    if (fmt === 'paren') return '(' + s + ')'
    if (fmt === 'parenUpper') return '(' + s.toUpperCase() + ')'
    return s
  }

  const state = {
    mode: 'flow',
    cols: 3,
    rows: 2,
    rgap: 16,
    cgap: 16,
    refWidth: 50,
    images: [],
    titles: {},
    colTitles: {},
    rowTitles: {},
    refTitle: '',
    titleMode: 'single',
    panelLabel: 'none',
    titlePos: 'top',
    titleAlign: 'left',
    font: 'sans',
    fontSize: 16,
    bgLight: true,
    exportScale: '1',
    exportFormat: 'png',
    aspectRatio: 'auto'
  }

  const history = { stack: [], pointer: -1, max: 30 }
  const drag = { sourceIdx: null, sourceEl: null }

  const $ = sel => document.querySelector(sel)
  const $$ = sel => Array.from(document.querySelectorAll(sel))

  function uid() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
  }

  function toast(text) {
    const old = document.querySelector('.toast')
    if (old) old.remove()
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = text
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1800)
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = reject
      fr.readAsDataURL(file)
    })
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = src
    })
  }

  function timestamp() {
    const d = new Date()
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }

  function computeOptimalAspectRatio(images) {
    const ratios = images.filter(i => i.w > 0 && i.h > 0).map(i => i.w / i.h)
    if (!ratios.length) return 4 / 3
    const logMean = ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length
    return Math.max(0.4, Math.min(2.5, Math.exp(logMean)))
  }

  function getEffectiveRatio() {
    if (state.aspectRatio !== 'auto') {
      const parts = state.aspectRatio.split(':').map(Number)
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1]
    }
    return computeOptimalAspectRatio(state.images)
  }

  function snapshot(arr) {
    return (arr || []).map(i => ({ id: i.id, name: i.name, data: i.data, w: i.w, h: i.h, addedAt: i.addedAt }))
  }

  function restoreImages(arr) {
    state.images = (arr || []).map(i => ({ id: i.id || uid(), name: i.name, data: i.data, w: i.w || 0, h: i.h || 0, addedAt: i.addedAt || Date.now() }))
  }

  async function addImagesFromFiles(files) {
    const accept = /\.(png|jpe?g|webp|svg|bmp|gif)$/i
    const list = Array.from(files).filter(f => accept.test(f.name))
    if (!list.length) return
    const out = []
    for (const file of list) {
      try {
        const dataUrl = await readFileAsDataURL(file)
        let w = 0, h = 0
        try { const r = await loadImage(dataUrl); w = r.w; h = r.h } catch (e) {}
        out.push({ id: uid(), name: file.name, data: dataUrl, w, h, addedAt: Date.now() })
      } catch (e) {}
    }
    if (!out.length) return
    pushHistory({ type: 'add-batch', images: snapshot(out) })
    state.images.push(...out)
    render(); autosave()
  }

  async function addImagesFromPaths(paths) {
    const out = []
    for (const p of paths) {
      try {
        const isDataURL = typeof p === 'string' && p.startsWith('data:')
        const dataUrl = isDataURL ? p : await window.platform.readFileAsDataURL(p)
        let w = 0, h = 0
        try { const r = await loadImage(dataUrl); w = r.w; h = r.h } catch (e) {}
        const name = isDataURL ? '截图' : (p.split(/[\\/]/).pop())
        out.push({ id: uid(), name, data: dataUrl, w, h, addedAt: Date.now() })
      } catch (e) {}
    }
    if (!out.length) return
    pushHistory({ type: 'add-batch', images: snapshot(out) })
    state.images.push(...out)
    render(); autosave()
  }

  function applyModeUI() {
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode))
    const layoutCard = $('#layout-card')
    layoutCard.querySelector('.matrix-only').hidden = state.mode !== 'matrix'
    layoutCard.querySelector('.ref-only').hidden = state.mode !== 'ref'
    const tm = $('#title-mode')
    Array.from(tm.options).forEach(o => {
      // 参考图模式只支持单图标题；矩阵模式才允许行列双标题
      o.hidden = (o.value === 'matrix' && state.mode !== 'matrix') || (state.mode === 'ref' && o.value !== 'single')
    })
    if (state.mode !== 'matrix' && state.titleMode === 'matrix') {
      state.titleMode = 'single'
      tm.value = 'single'
    }
    if (state.mode === 'ref' && state.titleMode !== 'single') {
      state.titleMode = 'single'
      tm.value = 'single'
    }
    tm.value = state.titleMode
  }

  function setMode(mode) {
    if (state.mode === mode) return
    pushHistory({ type: 'mode-change', from: state.mode, to: mode })
    state.mode = mode
    if (mode !== 'matrix' && state.titleMode === 'matrix') state.titleMode = 'single'
    applyModeUI()
    render(); autosave()
  }

  function render() {
    const empty = $('#empty-hint')
    const gridWrap = $('#grid-wrap')
    const refWrap = $('#ref-wrap')
    const refSide = $('#ref-side')
    const refGrid = $('#ref-grid-wrap')

    const hasImages = state.images.length > 0
    empty.hidden = hasImages
    gridWrap.hidden = state.mode === 'ref' || !hasImages
    refWrap.hidden = state.mode !== 'ref' || !hasImages

    $('#canvas').classList.toggle('bg-white', !state.bgLight)

    const root = $('#canvas-inner')
    root.style.setProperty('--cols', state.cols)
    root.style.setProperty('--rgap', state.rgap + 'px')
    root.style.setProperty('--cgap', state.cgap + 'px')
    root.style.setProperty('--ref-w', state.refWidth + '%')
    root.style.setProperty('--fs', state.fontSize + 'px')
    root.style.setProperty('--title-font', FONTS[state.font] || FONTS.sans)
    // 标题对齐：ta-left / ta-center / ta-right 作用于标题栏与标题输入框
    root.classList.remove('ta-left', 'ta-center', 'ta-right')
    root.classList.add('ta-' + (state.titleAlign || 'left'))

    const effRatio = getEffectiveRatio()
    root.style.setProperty('--tile-ratio', effRatio)
    const ratioHint = $('#ratio-hint')
    if (ratioHint) {
      if (state.aspectRatio === 'auto' && state.images.length) {
        ratioHint.hidden = false
        ratioHint.textContent = `自动适配中：当前比例 ≈ ${effRatio.toFixed(2)} : 1`
      } else {
        ratioHint.hidden = true
      }
    }

    $('#img-count').textContent = state.images.length + ' 张'
    $('#clear-btn').disabled = !hasImages
    $('#export-btn').disabled = !hasImages
    $('#matrix-capacity').textContent = `矩阵容量 ${state.cols * state.rows} 格`

    if (state.mode === 'flow') {
      renderFlow(gridWrap)
      refSide.innerHTML = ''
      refGrid.innerHTML = ''
    } else if (state.mode === 'matrix') {
      renderMatrix(gridWrap)
      refSide.innerHTML = ''
      refGrid.innerHTML = ''
    } else if (state.mode === 'ref') {
      gridWrap.innerHTML = ''
      renderRef(refSide, refGrid)
    }

    updateUndoBtns()
  }

  function renderFlow(container) {
    container.innerHTML = ''
    container.style.display = 'grid'
    container.style.gridTemplateColumns = ''
    container.classList.add('grid-wrap')
    container.classList.remove('matrix-grid')
    container.classList.remove('with-row-header')
    if (state.titleMode === 'single') {
      state.images.forEach((img, idx) => container.appendChild(makeTile(img, idx, 'flow-single')))
    } else if (state.titleMode === 'col') {
      for (let c = 0; c < state.cols; c++) container.appendChild(makeAxisInput('col', c, state.colTitles[c] || '', '列 ' + (c + 1)))
      state.images.forEach((img, idx) => container.appendChild(makeTile(img, idx, 'flow-col', { showTitle: false })))
    } else if (state.titleMode === 'row') {
      container.classList.add('with-row-header')
      container.style.gridTemplateColumns = `90px repeat(${state.cols}, 1fr)`
      const rows = Math.ceil(state.images.length / state.cols)
      for (let r = 0; r < rows; r++) {
        const rh = makeAxisInput('row', r, state.rowTitles[r] || '', '行 ' + (r + 1))
        rh.style.gridColumn = '1'
        rh.style.gridRow = String(r + 1)
        container.appendChild(rh)
        for (let c = 0; c < state.cols; c++) {
          const idx = r * state.cols + c
          if (idx >= state.images.length) break
          const tile = makeTile(state.images[idx], idx, 'flow-row', { showTitle: false })
          tile.style.gridColumn = String(c + 2)
          tile.style.gridRow = String(r + 1)
          container.appendChild(tile)
        }
      }
    }
  }

  function makeAxisInput(kind, index, value, placeholder) {
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.className = 'axis-input'
    inp.dataset.axis = kind
    inp.dataset.index = String(index)
    inp.value = value
    inp.placeholder = placeholder
    inp.addEventListener('input', () => {
      if (kind === 'col') state.colTitles[index] = inp.value
      else state.rowTitles[index] = inp.value
      autosave()
    })
    return inp
  }

  function renderMatrix(container) {
    container.innerHTML = ''
    container.style.display = 'grid'
    container.classList.add('matrix-grid')
    container.classList.remove('grid-wrap')
    container.style.gridTemplateColumns = ''

    const total = state.cols * state.rows
    if (state.images.length > total) {
      toast(`图片超出矩阵容量（${total} 格），仅显示前 ${total} 张`)
    }
    const tm = state.titleMode
    const colAtTop = tm === 'matrix' || tm === 'col'
    const rowAtLeft = tm === 'matrix' || tm === 'row'

    if (rowAtLeft) {
      container.classList.add('with-row-header')
      container.style.gridTemplateColumns = `90px repeat(${state.cols}, 1fr)`
    } else {
      container.classList.remove('with-row-header')
      container.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`
    }

    if (colAtTop) {
      if (rowAtLeft) {
        const spacer = document.createElement('div')
        spacer.style.gridColumn = '1'
        spacer.style.gridRow = '1'
        container.appendChild(spacer)
      }
      for (let c = 0; c < state.cols; c++) {
        const inp = makeAxisInput('col', c, state.colTitles[c] || '', '列 ' + (c + 1))
        inp.style.gridColumn = rowAtLeft ? String(c + 2) : String(c + 1)
        inp.style.gridRow = '1'
        container.appendChild(inp)
      }
    }

    const used = state.images.slice(0, total)
    const startRow = colAtTop ? 2 : 1
    for (let r = 0; r < state.rows; r++) {
      if (rowAtLeft) {
        const inp = makeAxisInput('row', r, state.rowTitles[r] || '', '行 ' + (r + 1))
        inp.style.gridColumn = '1'
        inp.style.gridRow = String(startRow + r)
        container.appendChild(inp)
      }
      for (let c = 0; c < state.cols; c++) {
        const gridIdx = r * state.cols + c
        const col = rowAtLeft ? (c + 2) : (c + 1)
        const row = startRow + r
        const img = used[gridIdx]
        if (img) {
          const tile = makeTile(img, gridIdx, 'matrix-cell', { showTitle: tm === 'single' })
          tile.style.gridColumn = String(col)
          tile.style.gridRow = String(row)
          container.appendChild(tile)
        } else {
          const box = document.createElement('div')
          box.className = 'tile'
          box.dataset.gridIdx = String(gridIdx)
          box.style.gridColumn = String(col)
          box.style.gridRow = String(row)
          const inner = document.createElement('div')
          inner.className = 'tile-img-box place-empty'
          inner.addEventListener('dragover', e => { e.preventDefault(); inner.classList.add('drag-over') })
          inner.addEventListener('dragleave', () => inner.classList.remove('drag-over'))
          inner.addEventListener('drop', e => { e.preventDefault(); inner.classList.remove('drag-over'); handleDropOnEmptyCell(gridIdx) })
          box.appendChild(inner)
          container.appendChild(box)
        }
      }
    }
  }

  function renderRef(refSide, refGrid) {
    refSide.innerHTML = ''
    refGrid.innerHTML = ''
    refGrid.style.display = 'grid'
    if (state.images.length === 0) return

    const refImg = state.images[0]
    const rest = state.images.slice(1)

    const tile = makeTile(refImg, 0, 'ref-tile', { showTitle: true, forceTop: true, titleKey: 'refTitle' })
    refSide.appendChild(tile)

    if (rest.length === 0) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.style.minHeight = '120px'
      hint.innerHTML = '<p>在右侧添加更多图参与对比</p>'
      refGrid.appendChild(hint)
    } else {
      rest.forEach((img, i) => refGrid.appendChild(makeTile(img, i + 1, 'ref-grid', { showTitle: state.titleMode === 'single' })))
    }
  }

  function makeTile(img, idx, kind, opts) {
    opts = opts || {}
    const tile = document.createElement('div')
    tile.className = 'tile'
    tile.dataset.idx = String(idx)
    tile.dataset.kind = kind
    if (kind === 'ref-tile') tile.classList.add('ref-tile')

    const showTitle = opts.showTitle !== false
    const titleKey = opts.titleKey || ('t_' + idx)
    const titlePos = opts.forceTop ? 'top' : state.titlePos
    const hasTitleText = !!(state.titles[titleKey] && state.titles[titleKey].trim())

    // 无标题时 hover 显示"＋ 添加标题"提示（列/行共用模式下无单图标题，不提示）
    const addHint = document.createElement('div')
    addHint.className = 'title-add-hint'
    addHint.textContent = '＋ 添加标题'
    if (hasTitleText || !showTitle) addHint.style.display = 'none'

    let titleInput = null
    // 行/列共用标题模式下无单图标题输入，但面板标号仍显示（期刊多面板常配共用轴标题 + 各面板标号）
    const labelOnly = !showTitle && state.panelLabel !== 'none'
    if (showTitle || labelOnly) {
      // 期刊面板标号作为标题前缀，如 "(a) 方法名"，随图片拖拽自动重排
      const labelText = panelLabelText(idx)
      const titleBar = document.createElement('div')
      titleBar.className = 'title-bar ' + titlePos + (labelText ? '' : ' no-label')
      if (labelText) {
        const pre = document.createElement('span')
        pre.className = 'title-prefix'
        pre.textContent = labelText
        titleBar.appendChild(pre)
      }
      if (showTitle) {
        titleInput = document.createElement('input')
        titleInput.type = 'text'
        titleInput.className = 'tile-title'
        titleInput.value = state.titles[titleKey] || ''
        titleInput.placeholder = labelText ? '标题内容...' : '输入标题...'
        titleInput.dataset.key = titleKey
        // 无标题且无标号时不显示标题栏；标号开启时始终显示（期刊面板必有标号）
        if (!hasTitleText && !labelText) titleBar.classList.add('tile-title-empty')
        titleInput.addEventListener('input', () => {
          state.titles[titleKey] = titleInput.value
          autosave()
        })
        titleInput.addEventListener('blur', () => {
          // 清空内容后失焦：无标号模式才隐藏，重新显示添加提示
          if (!titleInput.value.trim() && !labelText) {
            titleBar.classList.add('tile-title-empty')
            addHint.style.display = 'flex'
          }
        })
        titleBar.appendChild(titleInput)
      }
      // 纯标号栏（labelOnly）始终显示，无需输入框
      tile.appendChild(titleBar)
    }

    const box = document.createElement('div')
    box.className = 'tile-img-box'

    const imageEl = document.createElement('img')
    imageEl.className = 'tile-img'
    imageEl.src = img.data
    imageEl.alt = img.name || ''
    imageEl.draggable = false

    const handle = document.createElement('div')
    handle.className = 'drag-handle'
    handle.draggable = true
    handle.dataset.idx = String(idx)
    handle.addEventListener('dragstart', onTileDragStart)
    handle.addEventListener('dragend', onTileDragEnd)

    box.appendChild(imageEl)
    box.appendChild(handle)
    box.appendChild(addHint)

    // 点击图片区域 → 显示并聚焦标题输入框
    box.addEventListener('click', () => {
      if (titleInput) {
        const bar = tile.querySelector('.title-bar')
        if (bar) bar.classList.remove('tile-title-empty')
        addHint.style.display = 'none'
        titleInput.focus()
      }
    })

    box.addEventListener('dragover', e => { if (drag.sourceIdx !== null) { e.preventDefault(); box.classList.add('drag-over') } })
    box.addEventListener('dragleave', () => box.classList.remove('drag-over'))
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag-over'); onTileDrop(e, idx, kind) })

    const del = document.createElement('button')
    del.className = 'del-btn'
    del.textContent = '×'
    del.title = '删除该图'
    del.draggable = false
    del.addEventListener('pointerdown', e => e.stopPropagation())
    del.addEventListener('mousedown', e => e.stopPropagation())
    del.addEventListener('dragstart', e => { e.preventDefault(); e.stopPropagation() })
    del.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      deleteImage(idx)
    })

    tile.appendChild(box)
    tile.appendChild(del)
    return tile
  }

  function onTileDragStart(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    drag.sourceIdx = idx
    drag.sourceEl = e.currentTarget.closest('.tile')
    if (drag.sourceEl) drag.sourceEl.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  function onTileDragEnd() {
    if (drag.sourceEl) drag.sourceEl.classList.remove('dragging')
    $$('.tile-img-box.drag-over').forEach(b => b.classList.remove('drag-over'))
    drag.sourceIdx = null
    drag.sourceEl = null
  }

  function onTileDrop(e, targetIdx, targetKind) {
    const sourceIdx = drag.sourceIdx
    if (sourceIdx === null) return

    if (state.mode === 'ref') {
      if (targetKind === 'ref-tile' && sourceIdx !== 0) {
        const pre = snapshot(state.images)
        const m = state.images[sourceIdx]
        state.images.splice(sourceIdx, 1)
        state.images.unshift(m)
        commitReorder(pre); return
      }
      if (targetKind !== 'ref-tile' && sourceIdx === 0) {
        const pre = snapshot(state.images)
        const m = state.images[sourceIdx]
        state.images.splice(sourceIdx, 1)
        state.images.splice(targetIdx - 1, 0, m)
        commitReorder(pre); return
      }
    }

    if (state.mode === 'matrix') {
      const tileEl = e.currentTarget.closest('.tile')
      let targetGridIdx = -1
      if (tileEl && tileEl.dataset.gridIdx !== undefined) targetGridIdx = parseInt(tileEl.dataset.gridIdx, 10)
      if (!isNaN(targetGridIdx) && targetGridIdx >= 0) {
        if (String(sourceIdx) === String(targetGridIdx)) return
        const pre = snapshot(state.images)
        const m = state.images[sourceIdx]
        state.images.splice(sourceIdx, 1)
        if (targetGridIdx >= state.images.length) state.images.push(m)
        else state.images.splice(targetGridIdx, 0, m)
        commitReorder(pre); return
      }
    }

    const pre = snapshot(state.images)
    const m = state.images[sourceIdx]
    state.images.splice(sourceIdx, 1)
    if (targetIdx >= state.images.length) state.images.push(m)
    else state.images.splice(targetIdx, 0, m)
    commitReorder(pre)
  }

  function handleDropOnEmptyCell(gridIdx) {
    const sourceIdx = drag.sourceIdx
    if (sourceIdx === null) return
    const pre = snapshot(state.images)
    const m = state.images[sourceIdx]
    state.images.splice(sourceIdx, 1)
    state.images.splice(gridIdx, 0, m)
    commitReorder(pre)
  }

  function commitReorder(preSnap) {
    pushHistory({ type: 'reorder', preImages: preSnap, postImages: snapshot(state.images), titles: { ...state.titles } })
    // 单图标题按图 id 跟随图片移动：
    // preSnap 是重排前的顺序快照（含 id），用它配旧标题表建立 图id→标题 映射，
    // 再按当前（重排后）顺序重新生成 t_<idx> 键，标题才会跟着各自的图走
    if (state.titleMode === 'single') {
      const idToTitle = {}
      preSnap.forEach((img, i) => {
        if (state.titles['t_' + i] != null) idToTitle[img.id] = state.titles['t_' + i]
      })
      const next = {}
      state.images.forEach((img, i) => {
        if (idToTitle[img.id] != null) next['t_' + i] = idToTitle[img.id]
      })
      state.titles = next
    }
    render(); autosave()
  }

  function deleteImage(idx) {
    const img = state.images[idx]
    if (!img) return
    pushHistory({
      type: 'delete',
      preImages: snapshot(state.images),
      titles: { ...state.titles },
      removedIdx: idx,
      removedImage: { id: img.id, name: img.name, data: img.data, w: img.w, h: img.h, addedAt: img.addedAt }
    })
    state.images.splice(idx, 1)
    render(); autosave()
  }

  async function clearAll() {
    if (state.images.length === 0) return
    const confirmed = await window.platform.confirm(`确定清空全部 ${state.images.length} 张图片吗？`)
    if (!confirmed) return
    pushHistory({
      type: 'clear',
      preImages: snapshot(state.images),
      titles: { ...state.titles },
      colTitles: { ...state.colTitles },
      rowTitles: { ...state.rowTitles },
      refTitle: state.refTitle
    })
    state.images = []
    state.titles = {}
    state.colTitles = {}
    state.rowTitles = {}
    state.refTitle = ''
    render(); autosave()
  }

  function pushHistory(action) {
    if (history.pointer < history.stack.length - 1) history.stack = history.stack.slice(0, history.pointer + 1)
    history.stack.push(action)
    if (history.stack.length > history.max) history.stack.shift()
    history.pointer = history.stack.length - 1
    updateUndoBtns()
  }

  function updateUndoBtns() {
    $('#undo-btn').disabled = history.pointer < 0
    $('#redo-btn').disabled = history.pointer >= history.stack.length - 1
  }

  function undo() {
    if (history.pointer < 0) return
    const action = history.stack[history.pointer]
    history.pointer--
    applyUndo(action)
    render(); autosave()
  }

  function redo() {
    if (history.pointer >= history.stack.length - 1) return
    history.pointer++
    const action = history.stack[history.pointer]
    applyRedo(action)
    render(); autosave()
  }

  function applyUndo(action) {
    switch (action.type) {
      case 'add-batch': {
        const ids = new Set((action.images || []).map(i => i.id))
        state.images = state.images.filter(i => !ids.has(i.id))
        break
      }
      case 'delete': {
        restoreImages(action.preImages)
        state.titles = action.titles || {}
        if (action.removedImage && action.removedIdx != null) {
          if (action.removedIdx >= state.images.length) state.images.push(action.removedImage)
          else state.images.splice(action.removedIdx, 0, action.removedImage)
        }
        break
      }
      case 'clear': {
        restoreImages(action.preImages)
        state.titles = action.titles || {}
        state.colTitles = action.colTitles || {}
        state.rowTitles = action.rowTitles || {}
        state.refTitle = action.refTitle || ''
        break
      }
      case 'reorder': {
        restoreImages(action.preImages)
        state.titles = action.titles || {}
        break
      }
      case 'mode-change': {
        state.mode = action.from
        if (state.mode !== 'matrix' && state.titleMode === 'matrix') state.titleMode = 'single'
        applyModeUI()
        break
      }
    }
  }

  function applyRedo(action) {
    switch (action.type) {
      case 'add-batch': {
        (action.images || []).forEach(i => state.images.push({ id: i.id, name: i.name, data: i.data, w: i.w, h: i.h, addedAt: i.addedAt }))
        break
      }
      case 'delete': {
        if (action.removedIdx != null) state.images.splice(action.removedIdx, 1)
        break
      }
      case 'clear': {
        state.images = []
        state.titles = {}
        state.colTitles = {}
        state.rowTitles = {}
        state.refTitle = ''
        break
      }
      case 'reorder': {
        restoreImages(action.postImages)
        if (state.titleMode === 'single' && action.preImages) {
          // 用 pre 位置的标题按图 id 映射到 post 位置
          const idToTitle = {}
          action.preImages.forEach((img, i) => {
            if (action.titles && action.titles['t_' + i] != null) idToTitle[img.id] = action.titles['t_' + i]
          })
          const next = {}
          state.images.forEach((img, i) => {
            if (idToTitle[img.id] != null) next['t_' + i] = idToTitle[img.id]
          })
          state.titles = next
        } else {
          state.titles = action.titles || {}
        }
        break
      }
      case 'mode-change': {
        state.mode = action.to
        if (state.mode !== 'matrix' && state.titleMode === 'matrix') state.titleMode = 'single'
        applyModeUI()
        break
      }
    }
  }

  function autosave() {
    try {
      const snap = {
        mode: state.mode, cols: state.cols, rows: state.rows,
        rgap: state.rgap, cgap: state.cgap, refWidth: state.refWidth,
        titles: state.titles, colTitles: state.colTitles, rowTitles: state.rowTitles,
        refTitle: state.refTitle, titleMode: state.titleMode, titlePos: state.titlePos,
        panelLabel: state.panelLabel, titleAlign: state.titleAlign,
        font: state.font, fontSize: state.fontSize, bgLight: state.bgLight,
        exportScale: state.exportScale,
        exportFormat: state.exportFormat,
        aspectRatio: state.aspectRatio,
        images: snapshot(state.images)
      }
      window.platform.storage.set(STORAGE_KEY, JSON.stringify(snap))
    } catch (e) {}
  }

  function loadAutosave() {
    try {
      const raw = window.platform.storage.get(STORAGE_KEY)
      if (!raw) return null
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw
      return (s && s.images && s.images.length) ? s : null
    } catch (e) { return null }
  }

  function restoreFrom(snap) {
    Object.assign(state, {
      mode: snap.mode || 'flow',
      cols: snap.cols || 3, rows: snap.rows || 2,
      rgap: snap.rgap != null ? snap.rgap : 16, cgap: snap.cgap != null ? snap.cgap : 16,
      refWidth: snap.refWidth != null ? snap.refWidth : 50,
      titles: snap.titles || {}, colTitles: snap.colTitles || {}, rowTitles: snap.rowTitles || {},
      refTitle: snap.refTitle || '',
      titleMode: snap.titleMode || 'single', titlePos: snap.titlePos || 'top',
      panelLabel: snap.panelLabel || 'none',
      titleAlign: snap.titleAlign || 'left',
      font: snap.font || 'sans', fontSize: snap.fontSize || 16,
      bgLight: snap.bgLight !== false, exportScale: snap.exportScale || '1',
      exportFormat: snap.exportFormat || 'png',
      aspectRatio: snap.aspectRatio || 'auto'
    })
    restoreImages(snap.images)
    syncControlsFromState()
    applyModeUI()
    render()
  }

  function syncControlsFromState() {
    $('#cols-range').value = state.cols; $('#cols-num').value = state.cols
    $('#rows-range').value = state.rows; $('#rows-num').value = state.rows
    $('#rgap-range').value = state.rgap; $('#rgap-num').value = state.rgap
    $('#cgap-range').value = state.cgap; $('#cgap-num').value = state.cgap
    $('#ref-range').value = state.refWidth; $('#ref-num').textContent = state.refWidth + '%'
    $('#fs-range').value = state.fontSize; $('#fs-num').value = state.fontSize
    $('#title-mode').value = state.titleMode
    $('#panel-label').value = state.panelLabel
    $('#title-align').value = state.titleAlign
    $('#title-font').value = state.font
    $('#export-scale').value = state.exportScale
    $('#export-format').value = state.exportFormat
    $('#aspect-ratio').value = state.aspectRatio
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.pos === state.titlePos))
    $('#bg-toggle').textContent = state.bgLight ? '浅灰' : '纯白'
  }

  async function exportImages() {
    if (state.images.length === 0) return
    const btn = $('#export-btn')
    btn.disabled = true
    btn.textContent = '生成中...'
    try {
      const scaleMode = $('#export-scale').value
      const format = $('#export-format').value || 'png'
      const canvas = await composeCanvas(scaleMode)
      // 格式选择：png 无损；jpeg-92 / jpeg-85 有档质量。JPEG 无透明通道，
      // composeCanvas 已铺白/浅灰底，直接编码即可。
      const isJpeg = format.startsWith('jpeg')
      const quality = isJpeg ? parseFloat(format.split('-')[1]) / 100 : undefined
      const mime = isJpeg ? 'image/jpeg' : 'image/png'
      const blob = await new Promise(res => canvas.toBlob(res, mime, quality))
      if (!blob) throw new Error('编码失败')
      const ext = isJpeg ? 'jpg' : 'png'
      const filename = `图片对比_${timestamp()}.${ext}`
      const result = await window.platform.saveBlob(blob, filename)
      if (result && result.saved && result.path) {
        toast(window.platform.canSaveToPath ? '已保存到 ' + result.path : '已下载 ' + result.path)
      }
    } catch (e) {
      toast('导出失败：' + (e && e.message ? e.message : '未知错误'))
    } finally {
      btn.disabled = false
      btn.textContent = '导出图片'
    }
  }

  async function composeCanvas(scaleMode) {
    // 所见即所得：直接量测 #canvas-inner 里每个格子/标题/行列头的真实位置与尺寸，按比例绘制。
    // 布局只由 CSS 一套引擎决定，导出是"拍照"，不再有第二套几何计算。
    const inner = $('#canvas-inner')
    if (!inner) throw new Error('画布不可用')

    // 预加载全部图片（按 id 索引）
    const imgMap = new Map()
    for (const src of state.images) {
      try {
        const r = await loadImage(src.data)
        imgMap.set(src.id, { el: r.img, w: r.w, h: r.h })
      } catch (e) {
        imgMap.set(src.id, { el: null, w: src.w, h: src.h })
      }
    }

    // 收集当前模式下可见容器里的格子与行列标题
    const containers = []
    if (state.mode === 'ref') {
      const rs = $('#ref-side'), rg = $('#ref-grid-wrap')
      if (rs) containers.push(rs)
      if (rg) containers.push(rg)
    } else {
      const gw = $('#grid-wrap')
      if (gw) containers.push(gw)
    }
    const tiles = []
    const axisInputs = []
    containers.forEach(c => {
      c.querySelectorAll('.tile').forEach(t => tiles.push(t))
      c.querySelectorAll('.axis-input').forEach(a => axisInputs.push(a))
    })
    if (!tiles.length) throw new Error('没有可导出的内容')

    const innerRect = inner.getBoundingClientRect()
    const rel = el => {
      const r = el.getBoundingClientRect()
      return { x: r.left - innerRect.left, y: r.top - innerRect.top, w: r.width, h: r.height }
    }

    // 内容实际边界：以最深的元素底边为准（canvas-inner 有 min-height:100%，会撑满视口）
    let contentBottom = 0
    tiles.forEach(t => {
      const b = t.getBoundingClientRect().bottom - innerRect.top
      if (b > contentBottom) contentBottom = b
    })
    axisInputs.forEach(a => {
      const b = a.getBoundingClientRect().bottom - innerRect.top
      if (b > contentBottom) contentBottom = b
    })

    // 导出缩放：第一个图片格宽度映射到 360px；2x 档翻倍；原图档按最大原图宽放大
    // 参考图模式以右侧第一个对比格为基准（参考图本身不是网格格子）
    const scaleTile = (state.mode === 'ref' && tiles.length > 1) ? tiles[1] : tiles[0]
    const scaleBox = scaleTile.querySelector('.tile-img-box')
    const scaleBoxW = scaleBox ? scaleBox.getBoundingClientRect().width : 0
    if (!(scaleBoxW > 0)) throw new Error('画布尺寸异常')
    let scale = 360 / scaleBoxW
    if (scaleMode === '2') scale *= 2
    if (scaleMode === '0') {
      const maxNatW = Math.max(360, ...state.images.map(i => i.w || 0))
      scale = maxNatW / scaleBoxW
    }
    // 论文档：w 前缀编码目标宽度（mm/25.4*300DPI），整图等比缩放到精确宽度
    if (scaleMode.startsWith('w')) {
      const targetW = parseInt(scaleMode.slice(1), 10)
      scale = targetW / (innerRect.width + 40)
    }

    // 画布尺寸保护：Chrome canvas 单边上限约 16384px，超限整体等比缩小
    const baseW = innerRect.width + 40
    const baseH = contentBottom + 40
    const over = Math.max(baseW * scale, baseH * scale) / 16000
    if (over > 1) scale /= over
    const margin = 20 * scale

    const font = FONTS[state.font] || FONTS.sans
    const fs = state.fontSize
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(baseW * scale)
    canvas.height = Math.round(baseH * scale)
    const ctx = canvas.getContext('2d')
    // 画布底色跟随"浅灰/纯白"开关，与屏幕端 --canvas-bg 一致
    ctx.fillStyle = state.bgLight ? '#eceef0' : '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const drawText = (text, r) => {
      const v = (text || '').trim()
      if (!v) return
      ctx.font = (fs * scale) + 'px ' + font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#1f2329'
      ctx.fillText(v, margin + (r.x + r.w / 2) * scale, margin + (r.y + r.h / 2) * scale)
    }

    // 行列标题按真实位置绘制
    axisInputs.forEach(a => drawText(a.value, rel(a)))

    // 格子按真实位置与尺寸绘制
    tiles.forEach(tile => {
      const box = tile.querySelector('.tile-img-box')
      if (!box) return
      const r = rel(box)
      const x = margin + r.x * scale, y = margin + r.y * scale
      const w = r.w * scale, h = r.h * scale
      const isEmpty = box.classList.contains('place-empty')
      ctx.fillStyle = isEmpty ? '#f4f6f8' : '#f7f8fa'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = '#e2e5e9'
      const lw = Math.max(1, scale)
      ctx.lineWidth = lw
      if (isEmpty) ctx.setLineDash([4 * scale, 3 * scale])
      ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw)
      ctx.setLineDash([])

      const idx = parseInt(tile.dataset.idx, 10)
      const src = state.images[idx]
      const loaded = src ? imgMap.get(src.id) : null
      if (loaded && loaded.el && loaded.w && loaded.h) {
        const s = Math.min(w / loaded.w, h / loaded.h)
        const dw = loaded.w * s, dh = loaded.h * s
        ctx.drawImage(loaded.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
      }

      // 标题栏：面板标号作为标题前缀（与屏幕端 .title-bar 结构一致）
      // 标号与标题内容的对齐方式均遵循"对齐"设置，与屏幕端 CSS 一致
      const titleBar = tile.querySelector('.title-bar')
      if (titleBar && !titleBar.classList.contains('tile-title-empty')) {
        const pre = titleBar.querySelector('.title-prefix')
        const titleInput = titleBar.querySelector('.tile-title')
        const v = titleInput ? (titleInput.value || '').trim() : ''
        const align = state.titleAlign || 'left'
        const ir = titleInput ? rel(titleInput) : null
        if (ir && v) {
          ctx.font = (fs * scale) + 'px ' + font
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#1f2329'
          if (align === 'center') ctx.textAlign = 'center'
          else if (align === 'right') ctx.textAlign = 'right'
          else ctx.textAlign = 'left'
          const tx = align === 'center' ? ir.x + ir.w / 2 : (align === 'right' ? ir.x + ir.w : ir.x)
          ctx.fillText(v, margin + tx * scale, margin + (ir.y + ir.h / 2) * scale)
        }
        if (pre) {
          const pr = rel(pre)
          ctx.font = 'bold ' + (fs * scale) + 'px ' + font
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#1f2329'
          ctx.fillText(pre.textContent, margin + pr.x * scale, margin + (pr.y + pr.h / 2) * scale)
        }
      }
    })

    return canvas
  }

  // 期刊规格预设：版心宽度与字体规范来自各刊作者指南核实值（2026-08）
  // 宽度 = mm / 25.4 × 300DPI 取整；type 决定按图数自动排列的列数策略；
  // labelPt 为该刊面板标号/小标题的 pt 规范，用于换算屏幕字号，保证导出后 pt 值符合期刊要求
  const JOURNAL_PRESETS = {
    nature1: { name: 'Nature 单栏', width: 'w1051', font: 'sans', label: 'lower', type: 'single', labelPt: 8, note: 'Arial，粗体小写面板标号 8pt' },
    nature2: { name: 'Nature 双栏', width: 'w2161', font: 'sans', label: 'lower', type: 'double', labelPt: 8, note: '通栏 183mm，粗体小写面板标号 8pt' },
    pnas1:   { name: 'PNAS 单栏', width: 'w1028', font: 'sans', label: 'upper', type: 'single', labelPt: 8, note: '正文图宽 8.7cm，大写标号' },
    pnas2:   { name: 'PNAS 通栏', width: 'w2102', font: 'sans', label: 'upper', type: 'double', labelPt: 8, note: '宽图 17.8cm，大写标号' },
    ieee1:   { name: 'IEEE 单栏', width: 'w1051', font: 'sans', label: 'paren', type: 'single', labelPt: 8, note: '3.5in，标号 (a) (b) (c)' },
    ieee2:   { name: 'IEEE 双栏', width: 'w2150', font: 'sans', label: 'paren', type: 'double', labelPt: 8, note: '7.16in，标号 (a) (b) (c)' },
    cell2:   { name: 'Cell 双栏', width: 'w2055', font: 'sans', label: 'upper', type: 'double', labelPt: 8, note: 'Arial 6–8pt，大写标号 A B C' },
    acs2:    { name: 'ACS 双栏', width: 'w2102', font: 'sans', label: 'parenUpper', type: 'double', labelPt: 8, note: '504pt 上限，标号 (A) (B) (C)' },
    lancet1: { name: 'Lancet 单栏', width: 'w1264', font: 'times', label: 'lower', type: 'single', labelPt: 10, note: 'Times New Roman 10pt' }
  }

  // 按图片数量匹配期刊排列列数：
  // 单栏版心窄 → 最多 2 列；双栏通栏 → 1–4 列，5/6 图取 3 列、7/8 图取 4 列保持矩形
  function journalCols(type, n) {
    if (n <= 0) return 2
    if (type === 'single') return n === 1 ? 1 : 2
    const map = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 3, 6: 3, 7: 4, 8: 4, 9: 3 }
    return map[n] || Math.max(2, Math.min(4, Math.ceil(Math.sqrt(n))))
  }

  // 屏幕字号换算：导出时 scale = 目标宽px / 画布宽px，导出字号 = fontSize × scale。
  // 要让导出后的标号达到期刊 pt 规范（pt × 300DPI / 72 px），反推屏幕字号即可。
  function journalFontSize(preset) {
    const targetPx = parseInt(preset.width.slice(1), 10)
    const innerW = $('#canvas-inner').getBoundingClientRect().width + 40
    const px = preset.labelPt * 300 / 72
    return Math.max(12, Math.min(48, Math.round(px * innerW / targetPx)))
  }

  function applyJournalPreset(key) {
    const p = JOURNAL_PRESETS[key]
    if (!p) return
    const n = state.images.length

    // 版式规范：白底、标题在下、标号作为标题前缀
    state.exportScale = p.width
    state.font = p.font
    state.panelLabel = p.label
    state.bgLight = false
    state.titlePos = 'bottom'
    state.titleMode = 'single'

    // 按图数自动排列：流式自动换行，列数由期刊版心类型决定
    state.mode = 'flow'
    state.cols = journalCols(p.type, n)
    // 期刊多面板要求紧凑排列，间距收窄
    state.rgap = 8
    state.cgap = 8
    // 标题字号按期刊 pt 规范换算
    state.fontSize = journalFontSize(p)

    applyModeUI()
    syncControlsFromState()
    render(); autosave()
    toast(`已应用 ${p.name}：${n} 图排 ${state.cols} 列，${p.note}；标号字号 ${p.labelPt}pt`)
  }

  // 论文排版预设：一键设置布局规范 + 导出宽度（300DPI 列宽）
  function applyPreset(kind) {
    // 通用期刊规范：白底、无衬线标题、标题在下、小写面板标号
    state.bgLight = false
    state.font = 'sans'
    state.titlePos = 'bottom'
    state.panelLabel = 'lower'
    state.exportScale = 'w1051'

    if (kind === 'single') {
      // 单栏对比：矩阵 2 列，图多时行数自动
      setMode('matrix')
      state.cols = 2
      state.rows = Math.max(1, Math.ceil(state.images.length / 2))
      state.titleMode = 'single'
    } else if (kind === 'double') {
      // 双栏通栏：矩阵按图数自适应列数（≤4 列）
      setMode('matrix')
      const n = state.images.length || 1
      state.cols = Math.max(2, Math.min(4, n))
      state.rows = Math.max(1, Math.ceil(n / state.cols))
      state.titleMode = 'single'
      state.exportScale = 'w2161'
    } else if (kind === 'ref') {
      // 单图参考：参考图模式 50%，单栏宽度
      setMode('ref')
      state.refWidth = 50
      state.titleMode = 'single'
    }

    applyModeUI()
    syncControlsFromState()
    render(); autosave()
    const names = { single: '论文·单栏对比', double: '论文·双栏通栏', ref: '论文·单图参考' }
    toast('已应用预设：' + names[kind])
  }

  function bindControls() {
    const bindPair = (rangeSel, numSel, key, min, max) => {
      const r = $(rangeSel), n = $(numSel)
      const upd = v => {
        if (isNaN(v)) v = min
        v = Math.max(min, Math.min(max, v))
        state[key] = v
        r.value = v; n.value = v
        render(); autosave()
      }
      r.addEventListener('input', () => upd(parseInt(r.value, 10)))
      n.addEventListener('change', () => upd(parseInt(n.value, 10)))
    }
    bindPair('#cols-range', '#cols-num', 'cols', 1, 10)
    bindPair('#rows-range', '#rows-num', 'rows', 1, 10)
    bindPair('#rgap-range', '#rgap-num', 'rgap', 0, 100)
    bindPair('#cgap-range', '#cgap-num', 'cgap', 0, 100)
    bindPair('#fs-range', '#fs-num', 'fontSize', 12, 48)

    $('#ref-range').addEventListener('input', () => {
      state.refWidth = parseInt($('#ref-range').value, 10)
      $('#ref-num').textContent = state.refWidth + '%'
      render(); autosave()
    })

    $('#aspect-ratio').addEventListener('change', e => { state.aspectRatio = e.target.value; render(); autosave() })

    $('#title-mode').addEventListener('change', e => { state.titleMode = e.target.value; applyModeUI(); render(); autosave() })
    $('#panel-label').addEventListener('change', e => { state.panelLabel = e.target.value; render(); autosave() })
    $('#title-align').addEventListener('change', e => { state.titleAlign = e.target.value; render(); autosave() })
    $('#title-font').addEventListener('change', e => { state.font = e.target.value; render(); autosave() })
    $('#export-scale').addEventListener('change', e => { state.exportScale = e.target.value; autosave() })
    $('#export-format').addEventListener('change', e => { state.exportFormat = e.target.value; autosave() })

    $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
      $$('.seg-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      state.titlePos = b.dataset.pos
      render(); autosave()
    }))

    $('#bg-toggle').addEventListener('click', () => {
      state.bgLight = !state.bgLight
      $('#bg-toggle').textContent = state.bgLight ? '浅灰' : '纯白'
      $('#canvas').classList.toggle('bg-white', !state.bgLight)
      autosave()
    })

    $('#add-btn').addEventListener('click', () => $('#file-input').click())
    $('#file-input').addEventListener('change', e => { addImagesFromFiles(e.target.files); e.target.value = '' })
    $('#clear-btn').addEventListener('click', clearAll)
    $('#export-btn').addEventListener('click', exportImages)
    $('#undo-btn').addEventListener('click', undo)
    $('#redo-btn').addEventListener('click', redo)

    const canvas = $('#canvas')
    canvas.addEventListener('dragover', e => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).indexOf('Files') >= 0) e.preventDefault()
    })
    canvas.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault()
        addImagesFromFiles(e.dataTransfer.files)
      }
    })

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y') {
          const tag = e.target && e.target.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
          if (e.key === 'z' || e.key === 'Z') {
            if (e.shiftKey) { e.preventDefault(); redo() } else { e.preventDefault(); undo() }
          } else {
            e.preventDefault(); redo()
          }
        }
      }
    })
  }

  function setupPluginEnter() {
    window.platform.onEnterImages(paths => {
      if (paths && paths.length) addImagesFromPaths(paths)
    })
    // uTools 反馈命令：直接唤起反馈弹窗
    if (typeof window.platform.onCommand === 'function') {
      window.platform.onCommand(() => {
        if (typeof window.openFeedback === 'function') window.openFeedback()
      })
    }
  }

  function bootstrap() {
    $$('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)))
    $('#preset-single').addEventListener('click', () => applyPreset('single'))
    $('#preset-double').addEventListener('click', () => applyPreset('double'))
    $('#preset-ref').addEventListener('click', () => applyPreset('ref'))
    $('#journal-apply').addEventListener('click', () => {
      const v = $('#journal-preset').value
      if (!v) { toast('请先选择期刊'); return }
      applyJournalPreset(v)
    })
    bindControls()
    applyModeUI()

    const saved = loadAutosave()
    if (saved) {
      const countEl = $('#restore-count')
      const overlayEl = $('#restore-overlay')
      const yesBtn = $('#restore-yes')
      const noBtn = $('#restore-no')
      if (countEl) countEl.textContent = saved.images.length
      if (overlayEl) overlayEl.hidden = false
      if (yesBtn) {
        yesBtn.addEventListener('click', () => {
          if (overlayEl) overlayEl.hidden = true
          restoreFrom(saved)
        })
      }
      if (noBtn) {
        noBtn.addEventListener('click', () => {
          if (overlayEl) overlayEl.hidden = true
          window.platform.storage.remove(STORAGE_KEY)
          render()
        })
      }
    } else {
      render()
    }

    setupPluginEnter()
  }

  document.addEventListener('DOMContentLoaded', bootstrap)
})()