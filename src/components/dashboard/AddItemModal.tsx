import { useState, useEffect, useRef } from "react";
import { X, Search, Flame, Check, Loader2 } from "lucide-react";
import { cmd, type Section, type ItemData } from "../../lib/commands";
import { useSectionRefresh } from "../../contexts/SectionRefreshContext";

interface AddItemModalProps {
  sections: Section[];
  onClose: () => void;
  onAdded: () => void;
}

export function AddItemModal({ sections, onClose, onAdded }: AddItemModalProps) {
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id ?? "");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<ItemData[]>([]);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [allAdded, setAllAdded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchKeyword.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await cmd.searchItems(searchKeyword.trim(), 1, 50);
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchKeyword]);

  const { marketContext } = useSectionRefresh();

  const handleAdd = async (item: ItemData) => {
    if (!selectedSectionId || addingIds.has(item.item_id)) return;
    setAddingIds(prev => new Set(prev).add(item.item_id));
    try {
      await cmd.addSectionItem(
        selectedSectionId,
        marketContext.seasonId,
        marketContext.marketMode,
        item.item_id,
        item.price,
        1,
        0,
      );
      setAddedIds(prev => new Set(prev).add(item.item_id));

      // Remove from results after short success flash
      setTimeout(() => {
        setSearchResults(prev => prev.filter(r => r.item_id !== item.item_id));
        setAddedIds(prev => { const s = new Set(prev); s.delete(item.item_id); return s; });
        // If list is empty after removal, show all-added state
        if (searchResults.length === 1) {
          setAllAdded(true);
          setTimeout(onClose, 1000);
        }
      }, 600);
    } catch {
      // ignore
    } finally {
      setAddingIds(prev => { const s = new Set(prev); s.delete(item.item_id); return s; });
    }
  };

  const displayedResults = searchResults.filter(r => !addedIds.has(r.item_id));
  const isAllAdded = allAdded || (searchResults.length > 0 && displayedResults.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">添加物品到分组</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Section selector */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">选择分组</label>
            <select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm bg-white outline-none focus:border-blue-400 cursor-pointer"
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索物品名称..."
              autoFocus
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded text-sm bg-surface outline-none focus:border-blue-400 placeholder-slate-400"
            />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>

          {/* All added state */}
          {isAllAdded && !allAdded && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-green-600">
              <Check className="w-4 h-4" />
              已全部添加
            </div>
          )}

          {/* Results list */}
          {!isAllAdded && (
            <div className="max-h-80 overflow-y-auto border border-slate-100 rounded divide-y divide-slate-50">
              {searchResults.length === 0 && !searchLoading && searchKeyword.trim() && (
                <div className="py-8 text-center text-sm text-slate-400">
                  未找到「{searchKeyword}」相关的物品
                </div>
              )}
              {searchResults.length === 0 && !searchLoading && !searchKeyword.trim() && (
                <div className="py-8 text-center text-sm text-slate-400">
                  输入关键词搜索物品
                </div>
              )}
              {displayedResults.map(item => (
                <div
                  key={item.item_id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{item.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.item_type && (
                        <span className="text-xs text-slate-400">{item.item_type}</span>
                      )}
                      <span className="text-xs text-slate-400">{item.item_id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-orange-600 font-medium shrink-0">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    {item.price.toFixed(2)}
                  </div>
                  <button
                    onClick={() => handleAdd(item)}
                    disabled={addingIds.has(item.item_id) || addedIds.has(item.item_id)}
                    className={`shrink-0 px-2.5 py-1 rounded text-xs transition-colors ${
                      addedIds.has(item.item_id)
                        ? "bg-green-50 text-green-600"
                        : addingIds.has(item.item_id)
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    {addedIds.has(item.item_id) ? (
                      <span className="flex items-center gap-1"><Check className="w-3 h-3" />已添加</span>
                    ) : addingIds.has(item.item_id) ? (
                      "添加中..."
                    ) : (
                      "添加"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
