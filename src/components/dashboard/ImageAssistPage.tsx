import { Camera, Construction, Gem, Search, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

interface HighValueItem {
  id: string;
  name: string;
  itemType: string;
  affixes: string[];
  estimatedPrice: number;
  recordedAt: string;
}

export default function ImageAssistPage() {
  const [activeTab, setActiveTab] = useState<"scan" | "library">("scan");
  const [highValueItems, setHighValueItems] = useState<HighValueItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemAffixes, setNewItemAffixes] = useState("");

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    const item: HighValueItem = {
      id: Date.now().toString(),
      name: newItemName,
      itemType: "未分类",
      affixes: newItemAffixes.split("\n").filter(a => a.trim()),
      estimatedPrice: 0,
      recordedAt: new Date().toLocaleString("zh-CN"),
    };
    setHighValueItems([item, ...highValueItems]);
    setNewItemName("");
    setNewItemAffixes("");
  };

  const handleDeleteItem = (id: string) => {
    setHighValueItems(highValueItems.filter(item => item.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-purple-500" />
            识图助手
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">截图识别交易行物品词条并估价（开发中）</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              activeTab === "scan"
                ? "bg-purple-500 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            识图分析
          </button>
          <button
            onClick={() => setActiveTab("library")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
              activeTab === "library"
                ? "bg-purple-500 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Gem className="w-3.5 h-3.5" />
            高价值物品库
          </button>
        </div>
      </div>

      {/* Scan Tab */}
      {activeTab === "scan" && (
        <div className="space-y-4">
          {/* Upload Area */}
          <div className="bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
            <Camera className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <div className="text-sm text-slate-500 mb-2">识图分析功能开发中</div>
            <div className="text-xs text-slate-400 max-w-md mx-auto mb-4">
              即将推出截图识别功能，通过 OCR 识别交易行物品词条，
              <br />
              自动分析物品价值并给出价格建议。
            </div>
            <button
              disabled
              className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg opacity-50 cursor-not-allowed"
            >
              上传截图
            </button>
          </div>

          {/* Feature Preview */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center mb-3">
                <Camera className="w-5 h-5 text-purple-500" />
              </div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">截图识别</h3>
              <p className="text-xs text-slate-400">
                支持交易行截图上传，自动识别物品名称和词条
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
                <Search className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">词条分析</h3>
              <p className="text-xs text-slate-400">
                智能分析物品词条组合，判断是否为高价值属性
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-3">
                <Gem className="w-5 h-5 text-green-500" />
              </div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">价格评估</h3>
              <p className="text-xs text-slate-400">
                基于市场行情和历史数据，给出合理的价格区间
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Library Tab */}
      {activeTab === "library" && (
        <div className="space-y-4">
          {/* Add Item Form */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">添加高价值物品</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="物品名称"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={handleAddItem}
                disabled={!newItemName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </button>
            </div>
            <textarea
              value={newItemAffixes}
              onChange={(e) => setNewItemAffixes(e.target.value)}
              placeholder="物品词条（每行一个词条）"
              rows={3}
              className="w-full mt-3 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400 resize-none"
            />
          </div>

          {/* Items List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">高价值物品库</h3>
              <span className="text-xs text-slate-400">{highValueItems.length} 件物品</span>
            </div>
            {highValueItems.length === 0 ? (
              <div className="text-center py-12">
                <Gem className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <div className="text-sm text-slate-500">暂无高价值物品</div>
                <div className="text-xs text-slate-400 mt-1">添加您关注的高价值物品</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {highValueItems.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-start justify-between hover:bg-slate-50/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{item.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{item.itemType}</span>
                      </div>
                      {item.affixes.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {item.affixes.map((affix, idx) => (
                            <div key={idx} className="text-xs text-slate-500">• {affix}</div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1.5">{item.recordedAt}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
