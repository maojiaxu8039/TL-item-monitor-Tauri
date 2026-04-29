import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { Plus } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { SearchBar } from "@/components/dashboard/SearchBar"
import { SortableGroupCard } from "@/components/dashboard/SortableGroupCard"
import { AddSectionDialog } from "@/components/dashboard/AddSectionDialog"
import { Button } from "@/components/ui/button"
import { cmd, type Section } from "@/lib/commands"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

export default function DashboardContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { marketContext } = useSectionRefresh()

  const { data: sections = [], refetch } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getSections(),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id)
      const newIndex = sections.findIndex((s) => s.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newSections: Section[] = arrayMove(sections, oldIndex, newIndex)

        try {
          await cmd.reorderSections(newSections.map((s) => s.id))
          refetch()
          toast.success("分组顺序已保存")
        } catch (err) {
          console.error("Failed to reorder sections:", err)
          toast.error(`保存失败: ${err}`)
        }
      }
    }
  }, [sections, refetch])

  const handleAddSection = useCallback(async (name: string) => {
    try {
      await cmd.createSection(name)
      setDialogOpen(false)
      toast.success("分组添加成功")
      refetch()
    } catch (err) {
      console.error("Failed to create section:", err)
      toast.error(`添加失败: ${err}`)
    }
  }, [refetch])

  const handleDeleteSection = useCallback(async (id: string, name: string) => {
    if (confirm(`确定要删除分组 "${name}" 吗？`)) {
      try {
        await cmd.deleteSection(id)
        toast.success("分组已删除")
        refetch()
      } catch (err) {
        console.error("Failed to delete section:", err)
        toast.error(`删除失败: ${err}`)
      }
    }
  }, [refetch])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4 max-w-[1200px] mx-auto"
    >
      <SearchBar sections={sections} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence>
            {sections.map((section, index) => (
              <SortableGroupCard
                key={section.id}
                section={section}
                index={index}
                onDelete={() => handleDeleteSection(section.id, section.name)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
      <Button
        variant="outline"
        onClick={() => setDialogOpen(true)}
        className="mx-auto mt-1 w-full max-w-md rounded-xl border-2 border-dashed border-blue-300/70 py-3 text-blue-500 hover:bg-blue-50/50 hover:border-blue-400 transition-all h-auto text-[13px] font-medium"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        添加分组
      </Button>

      <AddSectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleAddSection}
        loading={false}
      />
    </motion.div>
  )
}
