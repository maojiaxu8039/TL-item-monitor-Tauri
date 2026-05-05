// lib/commands.ts — Updated types + all Tauri commands
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (mirror Rust structs)
// ============================================================================

export type PageId = "dashboard" | "firecompare" | "items" | "deals" | "imageassist" | "records" | "strategies" | "priceanalysis" | "aianalysis" | "import_export" | "settings" | "help";

export interface FirePriceUI {
  price_per_wan: number;
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio: number | null;
  trading_volume: string | null;
  source: string;
  source_time: string | null;
  scraped_at: number;
}

export interface DashboardSummary {
  fire: FirePriceUI | null;
  total_fire: number;
  total_rmb: number;
  season_name: string;
  market_mode: string;
  item_count: number;
  db_record_count: number;
  last_fire_at: string | null;
  last_items_at: string | null;
  task_running: boolean;
}

export interface Section {
  id: string;
  name: string;
  strategy_id: string | null;
  sort_order: number;
  collapsed: number;
  created_at: number;
  updated_at: number;
}

export interface SectionItem {
  id: string;
  section_id: string;
  season_id: string;
  market_mode: string;
  item_id: string;
  item_name: string | null;
  item_type: string | null;
  current_price: number | null;
  purchase_fire_price: number;
  count: number;
  more_value: number;
  sort_order: number;
  last_time: string | null;
  created_at: number;
  updated_at: number;
}

export interface SearchResult {
  items: ItemData[];
  total: number;
  page: number;
  page_size: number;
}

export interface ItemData {
  item_id: string;
  name: string;
  item_type: string;
  source: string;
  price: number;
  updated_at: string;
}

export interface FireHistoryItem {
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio: number | null;
  scraped_at: number;
  season_day: number;
}

export interface ItemHistoryRecord {
  item_id: string;
  season_id: string;
  market_mode: string;
  fire_price: number;
  scraped_at: number;
}

export interface FirePriceChangeItem {
  item_id: string;
  item_name: string;
  current_price: number;
  price_3h_ago: number | null;
  price_1h_ago: number | null;
  price_30m_ago: number | null;
  change_amount_3h: number | null;
  change_rate_3h: number | null;
  trend: string;
}

export interface SeasonSummary {
  current_fire_price: number;
  item_count: number;
  fire_high_24h: number;
  fire_low_24h: number;
  fire_avg_24h: number;
}

export interface SeasonTrendHour {
  hour: string;
  avg_fire_price: number;
  max_fire_price: number;
  min_fire_price: number;
  record_count: number;
}

export interface OkResponse {
  ok: boolean;
  message: string;
}

export interface FirePriceCompareResult {
  current_price: number;
  current_day: number;
  current_hour: number;
  history_avg: number;
  history_high: number;
  history_low: number;
  price_level: string;
  price_trend: string;
  reference_price: number;
  suggested_price: number;
  risk_tip: string;
  compare_data: ComparePoint[];
}

export interface ComparePoint {
  day: number;
  hour: number;
  history_price: number;
  current_price: number | null;
}

export interface ItemPriceCompare {
  item_id: string;
  name: string;
  current_price: number;
  history_price: number | null;
  premium_rate: number | null;
  price_diff: number | null;
  percentile: number | null;
}

export interface FirePriceInsight {
  current_fire_price: number;
  avg_fire_price: number;
  min_fire_price: number;
  max_fire_price: number;
  fire_trend: string;
  fire_trend_percent: number;
  best_buy_time: string;
  best_sell_time: string;
}

export interface ItemPriceInsight {
  item_id: string;
  item_name: string;
  current_price: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  price_trend: string;
  trend_percent: number;
  recommendation: string;
  confidence: number;
  reason: string;
}

export interface DbStats {
  item_count: number;
  db_record_count: number;
  db_size_kb: number;
}

export interface JsonFileValidationResult {
  valid: boolean;
  file_exists: boolean;
  is_readable: boolean;
  is_valid_json: boolean;
  item_count: number | null;
  error_message: string | null;
}

export interface ScrapeSettings {
  fire_price_mode: string;
  fire_price_scrape_interval: number;
  fire_price_scrape_enabled: boolean;
  items_source: string;
  items_json_path: string;
  items_reload_interval: number;
  auto_reload: boolean;
}

export interface DesktopSettings {
  auto_start: boolean;
  tray_on_close: boolean;
  mini_mode: boolean;
  free_layout: boolean;
}

export interface NotificationSettings {
  system_notifications: boolean;
  voice_alert_enabled: boolean;
  voice_alert_path: string;
  price_alert_enabled: boolean;
  price_alert_cooldown_seconds: number;
  quiet_start: string | null;
  quiet_end: string | null;
}

export interface DealSettings {
  bargain_enabled: boolean;
  bargain_threshold_percent: number;
  sell_enabled: boolean;
  sell_threshold_percent: number;
}

export interface NotificationPermissionStatus {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  unknown: boolean;
}

export interface DataSettings {
  history_retention: string;
  compress_history: boolean;
}

export interface AppSettings {
  season_id: string;
  language: string;
  auto_update: boolean;
}

export interface AppConfig {
  schema_version: number;
  scrape: ScrapeSettings;
  desktop: DesktopSettings;
  notification: NotificationSettings;
  deal: DealSettings;
  data: DataSettings;
  app: AppSettings;
}

export type WorthStatus = "Good" | "Consider" | "Bad" | "Unset";

export interface WorthResult {
  status: WorthStatus;
  purchase_fire_price: number | null;
  fire_per_10_more: number | null;
  total_fire: number;
  estimated_rmb: number;
}

export interface AlertRule {
  id: string;
  strategy_id: string | null;
  section_id: string | null;
  item_id: string | null;
  rule_type: string;
  threshold: number;
  enabled: number;
  cooldown_seconds: number;
  last_triggered_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AlertEvent {
  id: string;
  rule_id: string;
  section_item_id: string | null;
  triggered_at: number;
  message: string;
  seen: boolean;
  created_at: number;
}

export interface Strategy {
  id: string;
  name: string;
  season_scope: string;
  enabled: number;
  consider_ratio: number;
  sort_rule: string;
  notification_enabled: number;
  cooldown_seconds: number;
  quiet_start: string | null;
  quiet_end: string | null;
  created_at: number;
  updated_at: number;
}

export interface BackupInfo {
  last_backup_at: number | null;
  db_size_kb: number;
}

export interface SourceDiagnostic {
  source: string;
  source_type: string;
  enabled: number;
  market_mode: string | null;
  local_path: string | null;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_duration_ms: number | null;
  last_item_count: number | null;
  last_error: string | null;
  updated_at: number;
}

// ============================================================================
// Commands
// ============================================================================

export const cmd = {
  getDashboardSummary: () => invoke<DashboardSummary>("get_dashboard_summary"),
  setActiveMarketContext: (seasonId: string, marketMode: string) =>
    invoke("set_active_market_context", { seasonId, marketMode }),

  refreshFirePrice: () => invoke<FirePriceUI>("refresh_fire_price"),
  refreshItems: () => invoke<OkResponse>("refresh_items"),
  clearItemsDatabase: () => invoke<string>("clear_items_database"),
  validateJsonFile: (jsonPath: string) => invoke<JsonFileValidationResult>("validate_json_file", { jsonPath }),
  triggerPriceAlert: () => invoke<string>("trigger_price_alert"),
  getNotificationPermissionStatus: () => invoke<NotificationPermissionStatus>("get_notification_permission_status"),
  requestNotificationPermission: () => invoke<boolean>("request_notification_permission"),
  getItemTypes: () => invoke<string[]>("get_item_types"),
  searchItems: (keyword: string, page = 1, pageSize = 50, dayFilter?: number, typeFilter?: string) =>
    invoke<SearchResult>("search_items", { keyword, page, pageSize, dayFilter, typeFilter }),

  getSections: () => invoke<Section[]>("get_sections"),
  createSection: (name: string) => invoke<Section>("create_section", { name }),
  updateSection: (id: string, name: string) =>
    invoke<OkResponse>("update_section", { id, name }),
  deleteSection: (id: string) => invoke<OkResponse>("delete_section", { id }),
  reorderSections: (ids: string[]) => invoke<OkResponse>("reorder_sections", { ids }),

  getSectionItems: (sectionId: string) =>
    invoke<SectionItem[]>("get_section_items", { sectionId }),
  addSectionItem: (
    sectionId: string,
    seasonId: string,
    marketMode: string,
    itemId: string,
    purchaseFirePrice: number,
    count: number,
    moreValue: number
  ) =>
    invoke<SectionItem>("add_section_item", {
      sectionId,
      seasonId,
      marketMode,
      itemId,
      purchaseFirePrice,
      count,
      moreValue,
    }),
  updateSectionItem: (
    sectionId: string,
    itemId: string,
    patch: { count?: number; moreValue?: number; purchaseFirePrice?: number; lastTime?: string }
  ) => invoke<OkResponse>("update_section_item", { sectionId, itemId, patch }),
  removeSectionItem: (sectionId: string, itemId: string) =>
    invoke<OkResponse>("remove_section_item", { sectionId, itemId }),

  getFireHistory: (hours: number) =>
    invoke<FireHistoryItem[]>("get_fire_history", { hours }),
  getFireHistoryBySeason: (seasonId: string, marketMode: string, hours: number) =>
    invoke<FireHistoryItem[]>("get_fire_history_by_season", { seasonId, marketMode, hours }),

  importWatchlistCsv: (content: string) =>
    invoke<{ imported: number; errors: string[] }>("import_watchlist_csv", { content }),
  exportWatchlistCsv: () => invoke<string>("export_watchlist_csv"),

  getConfig: () => invoke<AppConfig>("get_config"),
  saveConfig: (config: AppConfig) =>
    invoke<OkResponse>("save_config", { config }),

  getDbStats: () => invoke<DbStats>("get_db_stats"),
  testNotification: () => invoke<OkResponse>("test_notification"),
  openLogDir: () => invoke<OkResponse>("open_log_dir"),

  evaluateWorth: (
    itemFirePrice: number,
    count: number,
    purchaseFirePrice: number,
    considerRatio: number,
    firePerRmb: number
  ) =>
    invoke<WorthResult>("evaluate_worth_cmd", {
      item_fire_price: itemFirePrice,
      count,
      purchase_fire_price: purchaseFirePrice,
      consider_ratio: considerRatio,
      fire_per_rmb: firePerRmb,
    }),

  getAlertRules: () => invoke<AlertRule[]>("get_alert_rules"),
  createAlertRule: (
    strategyId: string | null,
    sectionId: string | null,
    itemId: string | null,
    ruleType: string,
    threshold: number,
    cooldownSeconds: number
  ) =>
    invoke<AlertRule>("create_alert_rule", {
      strategy_id: strategyId,
      section_id: sectionId,
      item_id: itemId,
      rule_type: ruleType,
      threshold,
      cooldown_seconds: cooldownSeconds,
    }),
  updateAlertRule: (
    id: string,
    strategyId: string | null,
    sectionId: string | null,
    itemId: string | null,
    ruleType: string,
    threshold: number,
    cooldownSeconds: number,
    enabled: boolean
  ) =>
    invoke<OkResponse>("update_alert_rule", {
      id,
      strategy_id: strategyId,
      section_id: sectionId,
      item_id: itemId,
      rule_type: ruleType,
      threshold,
      cooldown_seconds: cooldownSeconds,
      enabled,
    }),
  toggleAlertRule: (id: string, enabled: boolean) =>
    invoke<OkResponse>("toggle_alert_rule", { id, enabled }),
  deleteAlertRule: (id: string) =>
    invoke<OkResponse>("delete_alert_rule", { id }),
  getAlertEvents: (limit: number) =>
    invoke<AlertEvent[]>("get_alert_events", { limit }),

  getBackupInfo: () => invoke<BackupInfo>("get_backup_info"),
  backupDatabase: (destPath: string) =>
    invoke<OkResponse>("backup_database", { dest_path: destPath }),
  restoreDatabase: (srcPath: string) =>
    invoke<OkResponse>("restore_database", { src_path: srcPath }),
  exportFireHistoryCsv: (hours: number) =>
    invoke<string>("export_fire_history_csv", { hours }),

  syncFireRecord: (params: {
    season_id: string;
    market_mode: string;
    rmb_per_10k_fire: number;
    fire_per_rmb: number;
    increase_ratio: number;
    trading_volume: string;
    source: string;
    source_time: string;
    recorded_at: number;
  }) => invoke<{ success: boolean; message?: string }>("sync_fire_record", { params }),

  syncItemsRecord: (params: {
    season_id: string;
    market_mode: string;
    item_id: string;
    name: string;
    item_type: string | null;
    price: number;
    last_time: number | null;
    recorded_at: number;
  }) => invoke<{ success: boolean; message?: string }>("sync_items_record", { params }),

  getFirePriceCompare: (historySeason: string) =>
    invoke<FirePriceCompareResult>("get_fire_price_compare", { historySeason }),

  getStrategies: () => invoke<Strategy[]>("get_strategies"),
  createStrategy: (name: string) =>
    invoke<Strategy>("create_strategy", { name }),
  updateStrategy: (strategy: Strategy) =>
    invoke<OkResponse>("update_strategy", { strategy }),
  deleteStrategy: (id: string) =>
    invoke<OkResponse>("delete_strategy", { id }),

  getSourceDiagnostics: () => invoke<SourceDiagnostic[]>("get_source_diagnostics"),
  testSourceConnection: (source: string) =>
    invoke<OkResponse>("test_source_connection", { source }),

  getItemHistory: (itemId: string, limit?: number) =>
    invoke<ItemHistoryRecord[]>("get_item_history", { item_id: itemId, limit }),
  getItemHistoryBySeason: (itemId: string, seasonId: string, limit?: number) =>
    invoke<ItemHistoryRecord[]>("get_item_history_by_season", { itemId, seasonId, limit }),
  getItemHistoryByDay: (itemId: string, seasonId: string, seasonDay: number) =>
    invoke<ItemHistoryRecord[]>("get_item_history_by_day", { itemId, seasonId, seasonDay }),
  getItemsPriceCompare: (historySeason: string, dayFilter?: number) => {
    const params: Record<string, unknown> = { historySeason };
    if (dayFilter !== undefined) {
      params.dayFilter = dayFilter;
    }
    return invoke<ItemPriceCompare[]>("get_items_price_compare", params);
  },
  getRealtimeFireChanges: () =>
    invoke<FirePriceChangeItem[]>("get_realtime_fire_changes"),
  seedRealtimeFireData: () =>
    invoke<number>("seed_realtime_fire_data"),
  getFirePriceInsight: () =>
    invoke<FirePriceInsight>("get_fire_price_insight"),
  getItemPriceInsights: () =>
    invoke<ItemPriceInsight[]>("get_item_price_insights"),
  getSeasonSummary: () => invoke<SeasonSummary>("get_season_summary"),
  getSeasonTrends: (hours?: number) =>
    invoke<SeasonTrendHour[]>("get_season_trends", { hours }),
  selectLocalItemsFile: () =>
    invoke<string | null>("select_local_items_file"),

  getDealAlerts: () =>
    invoke<{ bargains: DealAlert[]; sells: DealAlert[] }>("get_deal_alerts"),

  // Season management
  archiveSeason: (seasonId: string, archiveName?: string) =>
    invoke<ArchiveResult>("archive_season", { seasonId, archiveName }),
  initNewSeason: (seasonId: string, seasonName?: string) =>
    invoke<NewSeasonResult>("init_new_season", { seasonId, seasonName }),
  listSeasons: () =>
    invoke<SeasonInfo[]>("list_seasons"),
  getSeasonApiConfig: (seasonId: string) =>
    invoke<SeasonApiConfigResponse>("get_season_api_config_cmd", { seasonId }),
  setSeasonApiConfig: (seasonId: string, config: SeasonApiConfigInput) =>
    invoke<OkResponse>("set_season_api_config_cmd", { seasonId, ...config }),
};

export interface ArchiveResult {
  success: boolean;
  season_id: string;
  message: string;
  items_archived: number;
  fire_records_archived: number;
  snapshot_records_archived: number;
  archive_path: string | null;
}

export interface NewSeasonResult {
  success: boolean;
  season_id: string;
  message: string;
  tables_created: string[];
}

export interface SeasonInfo {
  season_id: string;
  name: string;
  is_current: boolean;
  started_at: number | null;
  ended_at: number | null;
  item_count: number;
  fire_record_count: number;
}

export interface SeasonApiConfigResponse {
  season_id: string;
  qiandao_tag_id_normal: string;
  qiandao_spec_id_normal: string;
  qiandao_tag_id_expert: string;
  qiandao_spec_id_expert: string;
  luosi_season_id_normal: number;
  luosi_season_id_expert: number;
}

export interface SeasonApiConfigInput {
  qiandao_tag_id_normal: string;
  qiandao_spec_id_normal: string;
  qiandao_tag_id_expert: string;
  qiandao_spec_id_expert: string;
  luosi_season_id_normal: number;
  luosi_season_id_expert: number;
}

export interface DealAlert {
  item_id: string;
  item_name: string;
  item_type: string | null;
  current_price: number;
  previous_price: number;
  change_percent: number;
  change_amount: number;
  direction: string;
  detected_at: number;
  confidence: number;
}
