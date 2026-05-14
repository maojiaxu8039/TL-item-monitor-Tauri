import { cn } from "@/lib/utils"
import { iconAssetMap, type IconAssetName } from "@/lib/icons"

interface AssetIconProps {
  name: IconAssetName
  className?: string
  label?: string
}

export function AssetIcon({ name, className, label }: AssetIconProps) {
  return (
    <img
      src={iconAssetMap[name]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={cn("torch-asset-icon h-5 w-5 select-none object-contain", className)}
      draggable={false}
    />
  )
}
