import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cmd, type Section, type SectionItem, type DashboardSummary } from "../../lib/commands";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerButton } from "@/components/ui/danger-button";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
  X,
  Flame,
  PackageSearch,
} from "lucide-react";
import { AddItemModal } from "./AddItemModal";

export default function StrategiesPage() {
  const qc = useQueryClient();
  const { marketContext } = useSectionRefresh();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  const { data: dashboardSummary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    staleTime: 5 * 60 * 1000,
  });

  const rmbPer10kFire = dashboardSummary?.fire?.rmb_per_10k_fire ?? 61.87;

  const createMutation = useMutation({
    mutationFn: cmd.createSection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] });
      setNewSectionName("");
      setCreatingSection(false);
      toast.success("分组创建成功");
    },
    onError: (err) => {
      toast.error(`创建失败: ${err}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: cmd.deleteSection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] });
      toast.success("分组已删除");
    },
    onError: (err) => {
      toast.error(`删除失败: ${err}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => cmd.updateSection(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] });
      setEditingSection(null);
      toast.success("分组名称已更新");
    },
    onError: (err) => {
      toast.error(`更新失败: ${err}`);
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ sectionId, itemId }: { sectionId: string; itemId: string }) =>
      cmd.removeSectionItem(sectionId, itemId),
    onSuccess: (_, { sectionId }) => {
      qc.invalidateQueries({ queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode, sectionId] });
      toast.success("物品已移除");
    },
    onError: (err) => {
      toast.error(`移除失败: ${err}`);
    },
  });

  const handleDeleteSection = (id: string, name: string) => {
    setSectionToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (sectionToDelete) {
      deleteMutation.mutate(sectionToDelete.id);
    }
    setDeleteDialogOpen(false);
    setSectionToDelete(null);
  };

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              策略管理
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">管理监控分组，编辑物品估值参数</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddItemOpen(true)}
              disabled={sections.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 rounded text-sm text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={sections.length === 0 ? "请先创建分组" : "添加物品到分组"}
            >
              <PackageSearch className="w-3.5 h-3.5" />
              添加物品
            </button>
            <button
              onClick={() => setCreatingSection(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 rounded text-sm text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新建分组
            </button>
          </div>
        </div>

        {/* Create section */}
        {creatingSection && (
          <div className="bg-white rounded-lg border-2 border-blue-300 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <input
                autoFocus
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="输入分组名称"
                className="w-full text-sm outline-none bg-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createMutation.mutate(newSectionName);
                  if (e.key === "Escape") setCreatingSection(false);
                }}
              />
            </div>
            <div className="px-4 py-3 flex gap-2">
              <button
                onClick={() => createMutation.mutate(newSectionName)}
                disabled={!newSectionName.trim() || createMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                确认
              </button>
              <button
                onClick={() => setCreatingSection(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-slate-500 text-xs rounded hover:bg-slate-100"
              >
                <X className="w-3 h-3" />
                取消
              </button>
            </div>
          </div>
        )}

        {/* Sections list */}
        {isLoading ? (
          <div className="text-center py-16 text-sm text-slate-400">加载中...</div>
        ) : sections.length === 0 && !creatingSection ? (
          <EmptyStrategies />
        ) : (
          <>
            {addItemOpen && (
              <AddItemModal
                sections={sections}
                onClose={() => setAddItemOpen(false)}
                onAdded={() => {
                  qc.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] });
                }}
              />
            )}
            <div className="space-y-3">
              {sections.map((section) => (
                <StrategyCard
                  key={section.id}
                  section={section}
                  expanded={expandedSections.has(section.id)}
                  onToggle={() => {
                    const next = new Set(expandedSections);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    setExpandedSections(next);
                  }}
                  editing={editingSection === section.id}
                  editName={editName}
                  onStartEdit={(name) => {
                    setEditingSection(section.id);
                    setEditName(name);
                  }}
                  onEditChange={setEditName}
                  onSaveEdit={() => updateMutation.mutate({ id: section.id, name: editName })}
                  onCancelEdit={() => setEditingSection(null)}
                  onDelete={() => handleDeleteSection(section.id, section.name)}
                  onRemoveItem={(itemId) => removeItemMutation.mutate({ sectionId: section.id, itemId })}
                  saving={updateMutation.isPending}
                  onOpenAddItem={() => setAddItemOpen(true)}
                  rmbPer10kFire={rmbPer10kFire}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="删除分组"
        message={`确定要删除分组 "${sectionToDelete?.name}" 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleConfirmDelete}
        loading={deleteMutation.isPending}
      />
    </>
  );
}

function StrategyCard({
  section,
  expanded,
  onToggle,
  editing,
  editName,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRemoveItem,
  saving,
  onOpenAddItem,
  rmbPer10kFire,
}: {
  section: Section;
  expanded: boolean;
  editing: boolean;
  editName: string;
  onToggle: () => void;
  onStartEdit: (name: string) => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
  saving: boolean;
  onOpenAddItem: () => void;
  rmbPer10kFire: number;
}) {
  const { marketContext } = useSectionRefresh();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode, section.id],
    queryFn: () => cmd.getSectionItems(section.id),
    enabled: expanded,
    staleTime: 300_000,
    gcTime: 600_000,
  });

  const totalFire = items.reduce((s, i) => s + (i.current_price ?? 0) * i.count, 0);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-slate-100">
        <button onClick={onToggle} className="p-1 text-slate-400 hover:text-slate-600 mr-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <Shield className="w-4 h-4 text-blue-400 mr-2" />

        {editing ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              autoFocus
              value={editName}
              onChange={(e) => onEditChange(e.target.value)}
              className="flex-1 text-sm font-medium border border-blue-300 rounded px-2 py-1 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <button onClick={onSaveEdit} disabled={saving} className="p-1 text-green-500 hover:text-green-600">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCancelEdit} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-sm font-medium text-slate-800 flex-1">{section.name}</span>
            <span className="text-xs text-slate-400 mr-3">{items.length} 件物品</span>
            <button
              onClick={() => onStartEdit(section.name)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
              title="编辑名称"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <DangerButton
              onClick={onDelete}
              title="删除分组"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </DangerButton>
          </>
        )}
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["物品名称", "类型", "数量", "当前火价", "RMB价值", "伤害MORE", "10MORE/火", "评估", "操作"].map((h) => (
                  <th key={h} className="px-3 py-2 text-xs text-slate-500 font-medium text-start first:pl-4 last:pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-6 text-slate-400 text-sm">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-6 text-slate-400 text-sm">暂无物品，点击下方添加</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-sm text-slate-900 pl-4">
                      <div className="font-medium">{item.item_name || item.item_id}</div>
                      {item.item_id && <div className="text-xs text-slate-400">{item.item_id}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500">{item.item_type || "—"}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{item.count}</td>
                    <td className="px-3 py-2.5 text-sm text-orange-600 font-medium">
                      <div className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-orange-400" />
                        {item.purchase_fire_price.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-green-600 font-medium">
                      ¥{((item.current_price ?? 0) * item.count * rmbPer10kFire / 10000).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500">—</td>
                    <td className="px-3 py-2.5 text-sm text-slate-500">—</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">不值</span>
                    </td>
                    <td className="px-3 py-2.5 pr-4">
                      <DangerButton
                        onClick={() => onRemoveItem(item.item_id)}
                        size="sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </DangerButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-3 py-2.5 text-sm font-semibold text-slate-700 pl-4">总计</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-sm text-slate-700">{items.reduce((s, i) => s + i.count, 0)}</td>
                  <td className="px-3 py-2.5 text-sm font-semibold text-orange-600">
                    <div className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-400" />
                      {totalFire.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm font-semibold text-green-600">
                    ¥{(totalFire * rmbPer10kFire / 10000).toFixed(2)}
                  </td>
                  {[3, 4, 5, 6].map((i) => <td key={i} className="px-3 py-2.5" />)}
                  <td className="px-3 py-2.5 pr-4" />
                </tr>
              </tfoot>
            )}
          </table>
          <div className="px-4 py-3 border-t border-slate-100">
            <button
              onClick={onOpenAddItem}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600"
            >
              <Plus className="w-3 h-3" />
              添加物品
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyStrategies() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
      <Shield className="w-12 h-12 text-slate-200 mx-auto mb-3" />
      <div className="text-sm text-slate-500 mb-4">还没有任何监控策略</div>
      <div className="text-xs text-slate-400 mb-4">创建分组来开始管理你的物品估值</div>
      <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors">
        创建第一个分组
      </button>
    </div>
  );
}