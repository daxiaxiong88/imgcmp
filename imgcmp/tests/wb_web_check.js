// imgcmp 网页版（EXE/uTools 同源）标题换行修复的结构校验 + 算法抽测
// 覆盖：textarea 化 / fitTextareaHeight / createTextMeasurer 探针 / wrapLines / CSS 配套
const fs = require('fs')
const ROOT = 'D:/Trae/mytrae work/imgcmp/'
const app = fs.readFileSync(ROOT + 'app.js', 'utf8')
const css = fs.readFileSync(ROOT + 'style.css', 'utf8')

let p = 0, f = 0
const ok = (n, c) => { c ? (p++, console.log('  ✓ ' + n)) : (f++, console.log('  ✗ ' + n)) }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const near = (a, b) => Math.abs(a - b) < 1e-9

// --- 屏幕端：标题/轴 textarea 化 + 自适应高度 ---
ok('单图标题改用自适应 textarea（rows=1 + spellcheck off）',
  /createElement\('textarea'\)\s*\n\s*titleInput\.rows = 1/.test(app) && /titleInput\.spellcheck = false/.test(app))
ok('轴标题改用自适应 textarea', /createElement\('textarea'\)\s*\n\s*inp\.rows = 1/.test(app) && /inp\.spellcheck = false/.test(app))
ok('fitTextareaHeight 输入即撑高（input 事件内调用）',
  /function fitTextareaHeight\(el\)\s*\{\s*el\.style\.height = 'auto'\s*el\.style\.height = el\.scrollHeight \+ 'px'/.test(app) &&
  (app.match(/fitTextareaHeight\(/g) || []).length >= 5)
ok('入 DOM 后 rAF 撑高（2 处 requestAnimationFrame(fit)）', (app.match(/requestAnimationFrame\(\(\) => fitTextareaHeight/g) || []).length === 2)
ok('旧的单行 input 构建已清除', !/createElement\('input'\)[\s\S]{0,120}\.className = '(tile-title|axis-input)'/.test(app))

// --- 导出端：量宽探针 + wrapLines + 逐行绘制 ---
ok('createTextMeasurer 探针校验（20 字 CJK，偏差>30% 判不可信）',
  /const createTextMeasurer = \(c, em\)/.test(app) && /'测{20}'/.test(app) && /Math\.abs\(pw - est\) \/ est < 0\.3/.test(app))
ok('measureText 不可信/缺失时退化为按字宽估算', /0x2e7f \? 1 : \(ch === ' ' \? 0\.3 : 0\.55\)/.test(app))
ok('探针前先设置目标字号（ctx.font 在建量宽器之前）', /ctx\.font = \(fs \* scale\) \+ 'px ' \+ font[\s\S]{0,1200}createTextMeasurer\(ctx, fs \* scale\)/.test(app))
ok('wrapLines 逐字贪心断行（超宽断行 + \\n 分行）',
  /const wrapLines = \(text, maxWidth\)/.test(app) && /measureTextWidth\(test\) > maxWidth/.test(app) && /ch === '\\n'/.test(app))
ok('行列标题与单图标题均逐行绘制（2 处 lines.forEach）', (app.match(/lines\.forEach/g) || []).length === 2)
ok('导出行高对齐屏幕 line-height 1.4（fs*1.4*scale ×2）', (app.match(/fs \* 1\.4 \* scale/g) || []).length === 2)

// --- CSS 配套 ---
ok('.tile-title 换行样式（line-height 1.4 + break-all + 去 resize）',
  /\.tile-title\s*\{[^}]*line-height:\s*1\.4/.test(css) && /\.tile-title\s*\{[^}]*word-break:\s*break-all/.test(css) && /\.tile-title\s*\{[^}]*resize:\s*none/.test(css))
ok('.axis-input 换行样式同上',
  /\.axis-input\s*\{[^}]*line-height:\s*1\.4/.test(css) && /\.axis-input\s*\{[^}]*word-break:\s*break-all/.test(css) && /\.axis-input\s*\{[^}]*resize:\s*none/.test(css))

// --- 算法抽测：从 app.js 提取真实源码执行 ---
const mCre = app.match(/const createTextMeasurer = \(c, em\) => \{[\s\S]*?\n    \}/)
const mWrap = app.match(/const wrapLines = \(text, maxWidth\) => \{[\s\S]*?\n    \}/)
if (!mCre || !mWrap) { console.error('未找到 createTextMeasurer / wrapLines 源码'); process.exit(1) }
const createTextMeasurer = new Function('return (' + mCre[0].replace('const createTextMeasurer = ', '') + ')')()
const wrapLines = new Function('measureTextWidth', 'return (' + mWrap[0].replace('const wrapLines = ', '') + ')')(s => s.length * 10)

const goodCtx = { measureText: s => ({ width: s.length * 10 }) }
ok('[抽测] measureText 可信时直接使用', createTextMeasurer(goodCtx, 10)('abc') === 30)
const badCtx = { measureText: s => ({ width: s.length * 1 }) }
ok('[抽测] measureText 失真时退化为估算', near(createTextMeasurer(badCtx, 10)('一二三'), 30))
ok('[抽测] measureText 缺失时退化为估算', near(createTextMeasurer({}, 10)('一二三'), 30))
const C20 = '一二三四五六七八九十一二三四五六七八九十'
ok('[抽测] 20 字断为 2 行', eq(wrapLines(C20, 100), [C20.slice(0, 10), C20.slice(10)]))
ok('[抽测] 显式 \\n 强制分行', eq(wrapLines('ab\ncd', 100), ['ab', 'cd']))
ok('[抽测] 超长单词按字符硬断', eq(wrapLines('abcdefghijk', 100), ['abcdefghij', 'k']))

console.log('\n结果: ' + p + ' 通过, ' + f + ' 失败')
process.exit(f ? 1 : 0)
