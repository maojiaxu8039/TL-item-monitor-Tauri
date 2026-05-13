import { Search, Plus, Upload, Download } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { cmd, type ItemData, type Section } from "@/lib/commands"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { save, open } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs"

interface SearchBarProps {
  sections?: Section[]
}

export function SearchBar({ sections = [] }: SearchBarProps) {
  const [searchValue, setSearchValue] = useState("")
  const [showResults, setShowResults] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null)
  const [showSectionMenu, setShowSectionMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { refreshSections, marketContext } = useSectionRefresh()

  const { data: searchResult, error } = useQuery({
    queryKey: ["search", searchValue, marketContext.seasonId, marketContext.marketMode],
    queryFn: async () => {
      try {
        const result = await cmd.searchItems(searchValue, 1, 20);
        return result;
      } catch (e) {
        console.error("SearchBar queryFn error:", e);
        throw e;
      }
    },
    enabled: searchValue.length >= 1,
  })

  const { data: itemTypes } = useQuery({
    queryKey: ["item-types"],
    queryFn: () => cmd.getItemTypes(),
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
      const errorMsg = String(error)
      if (errorMsg.includes("UNIQUE constraint failed")) {
        toast.error("该物品已在分组中，无需重复添加")
      } else {
        toast.error(`添加失败: ${error}`)
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
      const allSections = await cmd.getSections()
      let csvContent = "\uFEFF分组名称,物品名称,购买火价,数量\n"
      
      for (const section of allSections) {
        const sectionItems = await cmd.getSectionItems(section.id)
        for (const item of sectionItems) {
          csvContent += `"${section.name}","${item.item_name || ''}",${item.purchase_fire_price || ''},${item.count || ''}\n`
        }
      }
      
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
      toast.error(`导出失败: ${err}`)
    }
  }

  const handleImportList = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        multiple: false,
      })

      if (filePath) {
        const csvContent = await readTextFile(filePath as string)
        const lines = csvContent.trim().split('\n')

        if (lines.length < 2) {
          toast.error('CSV 文件为空或格式错误')
          return
        }

        const header = lines[0].toLowerCase()
        if (!header.includes('分组名称') && !header.includes('section')) {
          toast.error('CSV 文件格式不正确，需要包含"分组名称"和"物品名称"列')
          return
        }

        let imported = 0
        const errors: string[] = []

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          // Parse CSV line: "分组名称","物品名称",购买火价,数量
          const match = line.match(/^"([^"]+)","([^"]+)"(?:,([^,]*))?(?:,([^,]*))?$/)
          if (match) {
            const [, sectionName, itemName, purchaseFirePrice, count] = match
            try {
              // Search for item by name to get item_id
              const searchResult = await cmd.searchItems(itemName, 1, 5)
              const item = searchResult.items.find((it: ItemData) => it.name === itemName)

              if (!item) {
                errors.push(`第${i + 1}行: 未找到物品"${itemName}"`)
                continue
              }

              const sections = await cmd.getSections()
              let section = sections.find(s => s.name === sectionName)

              if (!section) {
                await cmd.createSection(sectionName)
                const newSections = await cmd.getSections()
                section = newSections.find(s => s.name === sectionName)
              }

              if (section) {
                await cmd.addSectionItem(
                  section.id,
                  marketContext.seasonId,
                  marketContext.marketMode,
                  item.item_id,
                  parseFloat(purchaseFirePrice || '') || 0,
                  parseInt(count || '') || 1,
                  0
                )
                imported++
              }
            } catch (err: any) {
              const errorMsg = String(err)
              if (errorMsg.includes("UNIQUE constraint failed")) {
                errors.push(`第${i + 1}行: 物品"${itemName}"已在分组"${sectionName}"中`)
              } else {
                errors.push(`第${i + 1}行: ${errorMsg}`)
              }
            }
          } else {
            errors.push(`第${i + 1}行: CSV格式不正确`)
          }
        }

        refreshSections()

        if (errors.length > 0) {
          if (imported > 0) {
            toast.success(`已导入 ${imported} 个物品`)
          }
          toast.error(
            <div className="max-h-40 overflow-auto">
              <div className="font-medium mb-1">导入完成，但有以下问题：</div>
              {errors.map((err, idx) => (
                <div key={idx} className="text-xs text-[var(--color-danger)]">{err}</div>
              ))}
            </div>
          )
        } else {
          toast.success(`成功导入 ${imported} 个物品`)
        }
      }
    } catch (err) {
      toast.error(`导入失败: ${err}`)
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
      <div className="flex items-center gap-3 rounded-lg border border-[rgba(255,184,0,0.16)] bg-[var(--color-panel)] p-3 shadow-[var(--shadow-sm)]">
        <Select className="h-9 w-[112px] flex-shrink-0 border-[rgba(255,184,0,0.18)] bg-[rgba(13,15,18,0.82)] text-[13px]">
          <option>全部类型</option>
          {itemTypes?.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>

        <div className="relative flex-1 min-w-0">
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

        <Button onClick={handleImportList} variant="outline" size="sm" className="h-9 gap-1.5 px-3 text-[13px]">
          <Upload className="h-3.5 w-3.5" />
          导入列表
        </Button>
        <Button onClick={handleExportList} variant="outline" size="sm" className="h-9 gap-1.5 px-3 text-[13px]">
          <Download className="h-3.5 w-3.5" />
          导出列表
        </Button>
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
