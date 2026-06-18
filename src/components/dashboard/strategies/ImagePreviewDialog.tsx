import { Dialog } from "@/components/ui/dialog";

interface ImagePreviewDialogProps {
  // 预览的图片地址，为 null 时关闭
  image: string | null;
  onClose: () => void;
}

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={onClose}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-3xl mx-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">加点图片预览</h3>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]">✕</button>
        </div>
        {image && (
          <img
            src={image}
            alt="加点图"
            className="w-full rounded-lg"
            style={{ maxHeight: '70vh', objectFit: 'contain' }}
          />
        )}
      </div>
    </Dialog>
  );
}
