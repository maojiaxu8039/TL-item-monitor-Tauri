import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GroupCard } from "./GroupCard"
import type { Section } from "@/lib/commands"

interface SortableGroupCardProps {
  section: Section
  index: number
  onDelete?: () => void
}

export function SortableGroupCard({ section, index, onDelete }: SortableGroupCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <GroupCard
        section={section}
        index={index}
        onDelete={onDelete}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}