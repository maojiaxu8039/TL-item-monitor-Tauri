export type PageId = "dashboard" | "season" | "items" | "strategies" | "alerts" | "records" | "import_export" | "settings" | "help"

export interface ItemData {
  name: string
  type: string
  count: number
  currentFire: number
  rmbPrice: number
  purchaseFire: number
  more: number
  firePerMore: string
  assess: string
  updatedAt?: string
}
