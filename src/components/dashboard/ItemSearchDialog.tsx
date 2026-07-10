import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Search, X, Package } from "lucide-react"
import { errorMessage } from "@/lib/utils"
import { toast } from "sonner"
import { cmd, type ItemSearchResult } from "@/lib/commands"
import { useDebounce } from "@/hooks/useDebounce"

export type ItemSearchDialogMode = "watch" | "position"

interface ItemSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ItemSearchDialogMode
  onSubmit: (params: {
    item: ItemSearchResult
    price: number
    quantity?: number
  }) => Promise<void> | void
}

const MIN_PRICE = 0.01

export function ItemSearchDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
}: ItemSearchDialogProps) {
  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<ItemSearchResult[]>([])
  const [selected, setSelected] = useState<ItemSearchResult | null>(null)
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const debouncedKeyword = useDebounce(keyword, 250)

  const isWatch = mode === "watch"

  const title = isWatch ? "添加买入监控" : "添加持仓"
  const priceLabel = isWatch ? "目标买入价格（火价）" : "买入价格"
  const submitLabel = isWatch ? "添加监控" : "添加持仓"

  useEffect(() => {
    if (!open) {
      setKeyword("")
      setResults([])
      setSelected(null)
      setPrice("")
      setQuantity("1")
      setSearching(false)
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    const fetchResults = async () => {
      if (!debouncedKeyword.trim()) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const items = await cmd.searchItemsForArbitrage(debouncedKeyword.trim())
        if (!cancelled) {
          setResults(items)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(`搜索失败: ${errorMessage(err)}`)
          setResults([])
        }
      } finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }
    fetchResults()
    return () => {
      cancelled = true
    }
  }, [debouncedKeyword])

  const priceError = useMemo(() => {
    const value = parseFloat(price)
    if (!price.trim()) return "请输入价格"
    if (Number.isNaN(value)) return "价格无效"
    if (value <= 0) return "价格必须大于 0"
    return null
  }, [price])

  const quantityError = useMemo(() => {
    if (isWatch) return null
    const value = parseInt(quantity, 10)
    if (!quantity.trim()) return "请输入数量"
    if (Number.isNaN(value)) return "数量无效"
    if (value <= 0) return "数量必须大于 0"
    return null
  }, [quantity, isWatch])

  const canSubmit =
    !!selected &&
    priceError === null &&
    quantityError === null &&
    !submitting

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        item: selected,
        price: parseFloat(price),
        quantity: isWatch ? undefined : parseInt(quantity, 10),
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(`操作失败: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden" aria-labelledby="item-search-dialog-title" data-mini-no-drag>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-soft)]">
          <h3 id="item-search-dialog-title" className="text-sm font-medium text-[var(--color-text)]">
            {title}
          </h3>
          <button
            type="button"
            aria-label="关闭物品搜索对话框"
            onClick={() => onOpenChange(false)}
            className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label htmlFor="item-search-input" className="block text-xs text-[var(--color-text-subtle)] mb-1">
              搜索物品
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-subtle)]" />
              <input
                id="item-search-input"
                type="text"
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入物品名称搜索..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--color-panel-soft)] border border-[var(--color-border-soft)] rounded outline-none focus:border-[var(--color-brand-gold)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]"
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto rounded border border-[var(--color-border-soft)]">
            {searching ? (
              <div className="px-3 py-4 text-xs text-center text-[var(--color-text-subtle)]">
                搜索中...
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-[var(--color-text-subtle)]">
                {keyword.trim() ? "未找到匹配的物品" : "请输入关键词搜索"}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-soft)]">
                {results.map((item) => {
                  const isSelected = selected?.item_id === item.item_id
                  return (
                    <li key={item.item_id}>
                      <button
                        type="button"
                        data-mini-no-drag
                        className={`w-full px-3 py-1.5 text-left text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[rgba(255,184,0,0.16)] text-[var(--color-text)]"
                            : "hover:bg-[var(--color-panel-soft)] text-[var(--color-text)]"
                        }`}
                        onClick={() => {
                          setSelected(item)
                          if (!price.trim() && item.price > 0) {
                            setPrice(item.price.toFixed(1))
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate flex items-center gap-1.5">
                          <Package className="w-3 h-3 text-[var(--color-text-subtle)]" />
                          {item.name}
                        </span>
                        <span className="text-[var(--color-text-subtle)] tabular-nums">
                          {item.price > 0 ? item.price.toFixed(1) : "—"}
                        </span>
                        </div>
                        <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">
                          {item.item_type || "未分类"} · ID: {item.item_id}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="item-search-price" className="block text-xs text-[var(--color-text-subtle)] mb-1">
                {priceLabel}
              </label>
              <input
                id="item-search-price"
                type="number"
                inputMode="decimal"
                min={MIN_PRICE}
                step="0.1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={!selected}
                placeholder={selected ? "例如 123.4" : "请先选择物品"}
                className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-panel-soft)] border border-[var(--color-border-soft)] rounded outline-none focus:border-[var(--color-brand-gold)] text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] disabled:opacity-60"
              />
              {priceError && price.trim() && (
                <p className="mt-1 text-[10px] text-[var(--color-danger)]">
                  {priceError}
                </p>
              )}
            </div>
            {!isWatch && (
              <div>
                <label htmlFor="item-search-quantity" className="block text-xs text-[var(--color-text-subtle)] mb-1">
                  数量
                </label>
                <input
                  id="item-search-quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={!selected}
                  className="w-full px-2.5 py-1.5 text-xs bg-[var(--color-panel-soft)] border border-[var(--color-border-soft)] rounded outline-none focus:border-[var(--color-brand-gold)] text-[var(--color-text)] disabled:opacity-60"
                />
                {quantityError && quantity.trim() && (
                  <p className="mt-1 text-[10px] text-[var(--color-danger)]">
                    {quantityError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            className="bg-[var(--color-brand-gold)] hover:opacity-90 text-black"
            onClick={handleSubmit}
          >
            {submitting ? "处理中..." : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
