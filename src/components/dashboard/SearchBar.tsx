import { Search, Plus, Upload, Download } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { cmd, type ItemData, type Section, type SectionItem } from "@/lib/commands"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { save, open } from "@tauri-apps/plugin-dialog"

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
      console.log("SearchBar queryFn called with:", { keyword: searchValue, seasonId: marketContext.seasonId, marketMode: marketContext.marketMode });
      try {
        const result = await cmd.searchItems(searchValue, 1, 20);
        console.log("SearchBar queryFn result:", result);
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
      let csvContent = "分组名称,物品ID,物品名称,购买火价,数量,溢出价值\n"
      
      for (const section of allSections) {
        const sectionItems = await cmd.getSectionItems(section.id)
        for (const item of sectionItems) {
          csvContent += `"${section.name}","${item.item_id}","${item.item_name || ''}",${item.purchase_fire_price},${item.count},${item.more_value}\n`
        }
      }
      
      const date = new Date().toISOString().slice(0, 10)
      const filePath = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: `TL_groups_${date}.csv`,
      })
      
      if (filePath) {
        const encoder = new TextEncoder()
        const bytes = encoder.encode(csvContent)
        const base64 = btoa(String.fromCharCode(...bytes))
        await cmd.writeFile(filePath, base64)
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
        const base64Content = await cmd.readFile(filePath as string)
        const binaryString = atob(base64Content)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const decoder = new TextDecoder('utf-8')
        const csvContent = decoder.decode(bytes)
        const lines = csvContent.trim().split('\n')
        
        if (lines.length < 2) {
          toast.error('CSV 文件为空或格式错误')
          return
        }
        
        const header = lines[0].toLowerCase()
        if (!header.includes('分组名称') && !header.includes('section')) {
          toast.error('CSV 文件格式不正确')
          return
        }
        
        let imported = 0
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          const match = line.match(/^"([^"]+)","([^"]+)","([^"]*)",([^,]+),([^,]+),(.+)$/)
          if (match) {
            const [, sectionName, itemId, , purchaseFirePrice, count, moreValue] = match
            try {
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
                  itemId,
                  parseFloat(purchaseFirePrice) || 0,
                  parseInt(count) || 1,
                  parseFloat(moreValue) || 0
                )
                imported++
              }
            } catch {
            }
          }
        }
        
        refreshSections()
        toast.success(`已导入 ${imported} 个物品`)
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
      <div className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-100">
        <Select className="h-9 w-[110px] text-[13px] flex-shrink-0 bg-slate-50 border-slate-200 rounded-lg">
          <option>全部类型</option>
          {itemTypes?.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={handleSearchChange}
            onFocus={() => searchValue.length >= 1 && setShowResults(true)}
            placeholder="输入物品名称搜索..."
            className="pl-9 h-9 text-[13px] bg-slate-50 border-slate-200 rounded-lg focus-visible:ring-blue-500 focus-visible:ring-1"
          />
        </div>

        <button onClick={handleImportList} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-600 hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" />
          导入列表
        </button>
        <button onClick={handleExportList} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-600 hover:bg-slate-50">
          <Download className="h-3.5 w-3.5" />
          导出列表
        </button>
      </div>

      <AnimatePresence>
        {showResults && !searchResult && !error && searchValue.length >= 1 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-4 text-sm text-slate-500 text-center">
            加载中...
          </div>
        )}
        {showResults && searchResult && searchResult.items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-4 text-sm text-slate-500 text-center"
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
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-80 overflow-auto"
          >
            <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-100">
              找到 {searchResult.total} 个结果
            </div>
            {searchResult.items.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
              >
                <div className="flex-1" onClick={() => handleAddItem(item)}>
                  <div className="text-sm font-medium text-slate-700">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.item_type || "—"} · {item.price}火</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 rounded-full hover:bg-blue-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddItem(item)
                  }}
                  disabled={addItemMutation.isPending}
                >
                  <Plus className="h-4 w-4 text-blue-500" />
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
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-medium text-slate-700">添加到分组</div>
            <div className="text-xs text-slate-400 mt-0.5">{selectedItem.name}</div>
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSelectSection(section.id)}
                disabled={addItemMutation.isPending}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="text-sm text-slate-700">{section.name}</span>
                {addItemMutation.isPending && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
