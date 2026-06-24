/**
 * 统一的 CSV 解析与序列化工具，遵循 RFC 4180：
 * - 支持字段两端的双引号（"..."）
 * - 支持字段内的逗号、换行、转义双引号（""）
 * - 自动剥离 UTF-8 BOM
 * - 兼容 LF / CRLF / CR 三种行尾
 *
 * 该模块为前端各处 CSV 导入 / 导出统一行为提供基础能力，避免散落在各组件
 * 中各自实现，导致正则脆弱、字段含逗号或引号时解析失败等问题。
 */

// 将单个 CSV 字段按 RFC 4180 规则进行转义：
// 若字段包含 " 、, 、\r 或 \n 则用双引号包裹，内部 " 转义为 ""
export function escapeCsvField(value: string | number | boolean | undefined | null): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// 将一份 CSV 文本解析为二维字符串数组
export function parseCsv(text: string): string[][] {
  if (text.length === 0) return []
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }

  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      current.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      current.push(field)
      rows.push(current)
      current = []
      field = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
      continue
    }
    field += ch
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ''))
}

// 将二维数组序列化为标准 CSV 字符串
// - withBom: 是否在开头写入 UTF-8 BOM（默认 true，便于 Excel 识别中文）
// - eol: 行尾字符，默认 CRLF（与 RFC 4180 一致，也是 Excel 默认）
export function rowsToCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
  opts: { withBom?: boolean; eol?: '\r\n' | '\n' } = {},
): string {
  const { withBom = true, eol = '\r\n' } = opts
  const body = rows.map((row) => row.map(escapeCsvField).join(',')).join(eol)
  return (withBom ? '\uFEFF' : '') + body + (rows.length > 0 ? eol : '')
}

// 在表头行中根据别名查找列索引，全部命中失败返回 -1
// - 大小写无关
// - 自动对表头单元做 trim
export function findColumnIndex(headerRow: ReadonlyArray<string>, ...aliases: string[]): number {
  const cells = headerRow.map((c) => c.trim().toLowerCase())
  for (const alias of aliases) {
    const idx = cells.indexOf(alias.toLowerCase())
    if (idx >= 0) return idx
  }
  return -1
}
