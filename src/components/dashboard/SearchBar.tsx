import { Search, Plus, Upload, Download } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { devLog } from "@/lib/devLog"
import { errorMessage } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { cmd, type ItemData, type Section } from "@/lib/commands"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { queryKeys } from "@/lib/queryKeys"
import { save, open } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs"
import { parseCsv, rowsToCsv, findColumnIndex } from "@/lib/csv"

interface SearchBarProps {
  sections?: Section[]
}

export function SearchBar({ sections = [] }: SearchBarProps) {
  const [searchValue, setSearchValue] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [showResults, setShowResults] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null)
  const [showSectionMenu, setShowSectionMenu] = useState(false)
  const [typeFilter, setTypeFilter] = useState("all")
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { refreshSections, marketContext, marketContextReady } = useSectionRefresh()

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchValue)
    }, 300)
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchValue])

  const { data: searchResult, error } = useQuery({
    queryKey: [...queryKeys.itemsSearch, marketContext.seasonId, marketContext.marketMode, debouncedSearch, typeFilter],
    queryFn: async () => {
      try {
        const result = await cmd.searchItems(
          debouncedSearch,
          1,
          20,
          undefined,
          typeFilter === "all" ? undefined : typeFilter
        );
        return result;
      } catch (e) {
        devLog.error("SearchBar queryFn error:", e);
        throw e;
      }
    },
    enabled: debouncedSearch.length >= 1 && marketContextReady,
  })

  const { data: itemTypes } = useQuery({
    queryKey: [...queryKeys.itemTypes, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getItemTypes(),
    enabled: marketContextReady,
  })

  const addItemMutation = useMutation({
    mutationFn: ({ sectionId, item }: { sectionId: string; item: ItemData }) =>
      cmd.addSectionItem(sectionId, marketContext.seasonId, marketContext.marketMode, item.item_id, item.price, 1, 0),
    onSuccess: () => {
      toast.success("物品已添加到分组")
      setSelectedItem(null)
      setShowSectionMenu(false)
      setSearchValue("")
      refreshSections()
    },
    onError: (error) => {
      const errorMsg = errorMessage(error)
      if (errorMsg.includes("UNIQUE constraint failed")) {
        toast.error("该物品已在分组中，无需重复添加")
      } else {
        toast.error(`添加失败: ${errorMessage(error)}`)
      }
    },
  })

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSectionMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
    setShowResults(e.target.value.length >= 1)
  }

  const handleAddItem = (item: ItemData) => {
    if (sections.length === 0) {
      toast.error("请先创建分组")
      return
    }
    setSelectedItem(item)
    setShowSectionMenu(true)
  }

  const handleSelectSection = (sectionId: string) => {
    if (selectedItem) {
      addItemMutation.mutate({ sectionId, item: selectedItem })
    }
  }

  const handleExportList = async () => {
    try {
      const allSections = await cmd.getSections(marketContext.marketMode)
      const rows: (string | number)[][] = [['分组名称', '物品名称', '购买火价', '数量']]

      for (const section of allSections) {
        const sectionItems = await cmd.getSectionItems(section.id, marketContext.seasonId, marketContext.marketMode)
        for (const item of sectionItems) {
          rows.push([
            section.name,
            item.item_name || '',
            item.purchase_fire_price ?? '',
            item.count ?? '',
          ])
        }
      }
      const csvContent = rowsToCsv(rows)

      const date = new Date().toISOString().slice(0, 10)
      const filePath = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: `TorchScan_groups_${date}.csv`,
      })

      if (filePath) {
        await writeTextFile(filePath, csvContent)
        toast.success(`已导出 ${allSections.length} 个分组`)
      }
    } catch (err) {
      toast.error(`导出失败: ${errorMessage(err)}`)
    }
  }

  const handleImportList = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        multiple: false,
      })
      if (!filePath) return

      const csvContent = await readTextFile(filePath as string)
      const rows = parseCsv(csvContent)

      if (rows.length < 2) {
        toast.error('CSV 文件为空或缺少数据行')
        return
      }

      // 表头列名 → 列索引映射，允许中英文混用与列顺序不固定
      const headerRow = rows[0]
      const sectionCol = findColumnIndex(headerRow, '分组名称', 'section', 'section_name', 'group')
      const itemCol = findColumnIndex(headerRow, '物品名称', 'item', 'item_name', 'name')
      const priceCol = findColumnIndex(headerRow, '购买火价', 'purchase_fire_price', 'fire_price', 'price')
      const countCol = findColumnIndex(headerRow, '数量', 'count', 'qty', 'quantity')

      if (sectionCol < 0 || itemCol < 0) {
        toast.error('CSV 文件格式不正确，必须包含"分组名称"和"物品名称"两列')
        return
      }

      let imported = 0
      const errors: string[] = []

      const allSections = await cmd.getSections(marketContext.marketMode)
      const sectionMap = new Map<string, Section>()
      for (const s of allSections) {
        sectionMap.set(s.name.trim(), s)
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const lineNo = i + 1
        const sectionName = (row[sectionCol] ?? '').trim()
        const itemName = (row[itemCol] ?? '').trim()
        const priceRaw = priceCol >= 0 ? (row[priceCol] ?? '').trim() : ''
        const countRaw = countCol >= 0 ? (row[countCol] ?? '').trim() : ''

        if (!sectionName || !itemName) {
          errors.push(`第${lineNo}行: 分组名称或物品名称为空`)
          continue
        }

        const purchaseFirePrice = priceRaw === '' ? 0 : Number.parseFloat(priceRaw)
        if (priceRaw !== '' && !Number.isFinite(purchaseFirePrice)) {
          errors.push(`第${lineNo}行: 购买火价 "${priceRaw}" 不是有效数字`)
          continue
        }
        const count = countRaw === '' ? 1 : Number.parseInt(countRaw, 10)
        if (countRaw !== '' && (!Number.isFinite(count) || count <= 0)) {
          errors.push(`第${lineNo}行: 数量 "${countRaw}" 不是有效正整数`)
          continue
        }

        try {
          // 优先精确匹配；其次去空格后匹配
          const searchResult = await cmd.searchItems(itemName, 1, 10)
          const item =
            searchResult.items.find((it: ItemData) => it.name === itemName) ||
            searchResult.items.find((it: ItemData) => it.name.trim() === itemName)

          if (!item) {
            errors.push(`第${lineNo}行: 未找到物品 "${itemName}"`)
            continue
          }

          let section = sectionMap.get(sectionName)
          if (!section) {
            await cmd.createSection(sectionName, marketContext.marketMode)
            const newSections = await cmd.getSections(marketContext.marketMode)
            for (const s of newSections) {
              sectionMap.set(s.name.trim(), s)
            }
            section = sectionMap.get(sectionName)
          }
          if (!section) {
            errors.push(`第${lineNo}行: 无法创建分组 "${sectionName}"`)
            continue
          }

          await cmd.addSectionItem(
            section.id,
            marketContext.seasonId,
            marketContext.marketMode,
            item.item_id,
            purchaseFirePrice,
            count || 1,
            0,
          )
          imported++
        } catch (err: unknown) {
          const errorMsg = errorMessage(err)
          if (errorMsg.includes('UNIQUE constraint failed')) {
            errors.push(`第${lineNo}行: 物品 "${itemName}" 已在分组 "${sectionName}" 中`)
          } else {
            errors.push(`第${lineNo}行: ${errorMsg}`)
          }
        }
      }

      refreshSections()

      if (errors.length === 0) {
        toast.success(`成功导入 ${imported} 个物品`)
        return
      }

      if (imported > 0) {
        toast.success(`已导入 ${imported} 个物品`)
      }
      const previewErrors = errors.slice(0, 10)
      const remaining = errors.length - previewErrors.length
      toast.error(
        <div className="max-h-40 overflow-auto">
          <div className="font-medium mb-1">
            导入完成：成功 {imported} 条，失败 {errors.length} 条
          </div>
          {previewErrors.map((err, idx) => (
            <div key={idx} className="text-xs text-[var(--color-danger)]">{err}</div>
          ))}
          {remaining > 0 && (
            <div className="text-xs text-[var(--color-text-subtle)] mt-1">
              ... 还有 {remaining} 条错误未显示
            </div>
          )}
        </div>,
      )
    } catch (err) {
      toast.error(`导入失败: ${errorMessage(err)}`)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="relative"
      ref={containerRef}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[rgba(255,184,0,0.16)] bg-[var(--color-panel)] p-3 shadow-[var(--shadow-sm)]">
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            if (searchValue.length >= 1) {
              setShowResults(true)
            }
          }}
          className="h-9 w-[112px] flex-shrink-0 border-[rgba(255,184,0,0.18)] bg-[rgba(13,15,18,0.82)] text-[13px]"
        >
          <option value="all">全部类型</option>
          {itemTypes?.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>

        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={handleSearchChange}
            onFocus={() => searchValue.length >= 1 && setShowResults(true)}
            placeholder="输入物品名称搜索..."
            className="h-9 border-[rgba(255,184,0,0.18)] bg-[rgba(13,15,18,0.82)] pl-9 text-[13px]"
          />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Button onClick={handleImportList} variant="outline" size="sm" className="h-9 gap-1.5 px-3 text-[13px]">
            <Upload className="h-3.5 w-3.5" />
            导入列表
          </Button>
          <Button onClick={handleExportList} variant="outline" size="sm" className="h-9 gap-1.5 px-3 text-[13px]">
            <Download className="h-3.5 w-3.5" />
            导出列表
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showResults && !searchResult && !error && searchValue.length >= 1 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[var(--color-panel)] p-4 text-center text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-lg)]">
            加载中...
          </div>
        )}
        {showResults && searchResult && searchResult.items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[var(--color-panel)] p-4 text-center text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-lg)]"
          >
            未找到匹配的物品
          </motion.div>
        )}
        {showResults && searchResult && searchResult.items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-auto rounded-lg border border-[rgba(255,184,0,0.2)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)]"
          >
            <div className="border-b border-[var(--color-border-soft)] px-3 py-2 text-xs text-[var(--color-text-subtle)]">
              找到 {searchResult.total} 个结果
            </div>
            {searchResult.items.map((item) => (
              <div
                key={item.item_id}
                className="flex cursor-pointer items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-2.5 transition-colors last:border-0 hover:bg-[rgba(255,184,0,0.06)]"
              >
                <div className="flex-1" onClick={() => handleAddItem(item)}>
                  <div className="text-sm font-medium text-[var(--color-text)]">{item.name}</div>
                  <div className="text-xs text-[var(--color-text-subtle)]">{item.item_type || "—"} · {item.price}火</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-lg p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddItem(item)
                  }}
                  disabled={addItemMutation.isPending}
                >
                  <Plus className="h-4 w-4 text-[var(--color-brand-gold)]" />
                </Button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {showSectionMenu && selectedItem && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-[var(--color-border-soft)] px-4 py-3">
            <div className="text-sm font-medium text-[var(--color-text)]">添加到分组</div>
            <div className="mt-0.5 text-xs text-[var(--color-text-subtle)]">{selectedItem.name}</div>
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSelectSection(section.id)}
                disabled={addItemMutation.isPending}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,184,0,0.06)] disabled:opacity-50"
              >
                <span className="text-sm text-[var(--color-text)]">{section.name}</span>
                {addItemMutation.isPending && (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-[var(--color-brand-gold)]" />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
