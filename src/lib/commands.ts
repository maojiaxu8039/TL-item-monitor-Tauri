// lib/commands.ts — Updated types + all Tauri commands
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types (mirror Rust structs)
// ============================================================================

export type PageId = "dashboard" | "firecompare" | "items" | "deals" | "records" | "strategies" | "priceanalysis" | "aianalysis" | "import_export" | "settings" | "help" | "alerts" | "arbitrage" | "inventory";

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
  history_fire: FirePriceUI | null;
  total_fire: number;
  total_rmb: number;
  season_name: string;
  market_mode: string;
  item_count: number;
  db_record_count: number;
  last_fire_at: string | null;
  last_items_at: string | null;
  task_running: boolean;
  profitable_arbitrage_count: number;
  position_cost_fire: number;
  position_cost_rmb: number;
  position_current_value_fire: number;
  position_current_value_rmb: number;
}

export interface Section {
  id: string;
  name: string;
  strategy_id: string | null;
  market_mode: string;
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

export interface SectionContextItem {
  id: string;
  section_id: string;
  section_name: string;
  item_id: string;
  item_name: string;
  item_type: string | null;
  current_price: number | null;
  purchase_fire_price: number;
  count: number;
  more_value: number;
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
  season_day?: number | null;
}

export interface ImportResp {
  imported: number;
  errors: string[];
}

export interface FirePriceChangeItem {
  item_id: string;
  name: string;
  current_price: number;
  price_5m_ago: number | null;
  price_30m_ago: number | null;
  price_1h_ago: number | null;
  price_3h_ago: number | null;
  change_rate_5m: number | null;
  change_rate_30m: number | null;
  change_rate_1h: number | null;
  change_rate_3h: number | null;
  trend: string;
  score: number;
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
  is_stale: boolean;
  age_seconds: number;
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
  fire_scrape_normal_enabled: boolean;
  fire_scrape_expert_enabled: boolean;
  items_source: string;
  items_json_path: string;
  items_reload_interval: number;
  auto_reload: boolean;
  items_scrape_normal_enabled: boolean;
  items_scrape_expert_enabled: boolean;
}

export interface DesktopSettings {
  auto_start: boolean;
  tray_on_close: boolean;
  mini_mode: boolean;
  free_layout: boolean;
  mini_opacity: number;
  mini_always_on_top: boolean;
  mini_width: number;
  mini_height: number;
  mini_x: number | null;
  mini_y: number | null;
}

export interface WindowModeState {
  mini_mode: boolean;
  opacity: number;
  always_on_top: boolean;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
}

export interface NotificationSettings {
  system_notifications: boolean;
  mac_desktop_notifications: boolean;
  win_desktop_notifications: boolean;
  voice_alert_enabled: boolean;
  voice_alert_path: string;
  price_alert_enabled: boolean;
  price_alert_cooldown_seconds: number;
  buy_alert_enabled: boolean;
  buy_alert_cooldown_seconds: number;
  sell_alert_enabled: boolean;
  sell_alert_cooldown_seconds: number;
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

export interface SyncFailure {
  itemId?: string;
  itemName?: string;
  recordType: "fire" | "items";
  reason: string;
  timestamp: number;
}

export interface SyncJobState {
  id: string;
  dataType: "fire" | "items";
  mode: "normal" | "expert";
  range: "24h" | "3d" | "7d" | "30d" | "season";
  status: "idle" | "running" | "success" | "partial" | "failed";
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startedAt: number;
  finishedAt: number | null;
  firstError: string | null;
  failures: SyncFailure[];
}

export interface SyncResult {
  synced: number;
  type: "fire" | "items";
  message?: string;
  total?: number;
  failed?: number;
  skipped?: number;
  firstError?: string;
  failures?: SyncFailure[];
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
  item_name: string | null;
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

export interface ComponentHealth {
  status: string;
  message: string | null;
  latency_ms: number | null;
}

export interface HealthStatus {
  status: string;
  version: string;
  database: ComponentHealth;
  data_dir: ComponentHealth;
  uptime_seconds: number;
  checked_at: number;
}

export interface DatabaseMaintenanceResult {
  db_size_kb_before: number;
  db_size_kb_after: number;
  wal_size_kb_before: number;
  wal_size_kb_after: number;
  total_size_kb_before: number;
  total_size_kb_after: number;
  freed_kb: number;
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
  fetchServerJson: <T = unknown>(url: string) =>
    invoke<T>("fetch_server_json_cmd", { url }),
  postServerJson: <T = unknown>(url: string, body: unknown) =>
    invoke<T>("post_server_json_cmd", { url, body }),
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

  getSections: (marketMode: string) => invoke<Section[]>("get_sections", { marketMode }),
  createSection: (name: string, marketMode: string) => invoke<Section>("create_section", { name, marketMode }),
  updateSection: (id: string, name: string) =>
    invoke<OkResponse>("update_section", { id, name }),
  deleteSection: (id: string, marketMode: string) => invoke<OkResponse>("delete_section", { id, marketMode }),
  reorderSections: (ids: string[]) => invoke<OkResponse>("reorder_sections", { ids }),

  getSectionItems: (sectionId: string, seasonId: string, marketMode: string) =>
    invoke<SectionItem[]>("get_section_items", { sectionId, seasonId, marketMode }),
  getSectionItemsForContext: (seasonId: string, marketMode: string) =>
    invoke<SectionContextItem[]>("get_section_items_for_context", { seasonId, marketMode }),
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
    seasonId: string,
    marketMode: string,
    itemId: string,
    patch: { count?: number; moreValue?: number; purchaseFirePrice?: number; lastTime?: string }
  ) => invoke<OkResponse>("update_section_item", { sectionId, seasonId, marketMode, itemId, patch }),
  removeSectionItem: (sectionId: string, seasonId: string, marketMode: string, itemId: string) =>
    invoke<OkResponse>("remove_section_item", { sectionId, seasonId, marketMode, itemId }),

  getFireHistory: (hours: number) =>
    invoke<FireHistoryItem[]>("get_fire_history", { hours }),
  getFireHistoryBySeason: (seasonId: string, marketMode: string, hours: number) =>
    invoke<FireHistoryItem[]>("get_fire_history_by_season", { seasonId, marketMode, hours }),

  importWatchlistCsv: (content: string) =>
    invoke<{ imported: number; errors: string[] }>("import_watchlist_csv", { content }),
  exportWatchlistCsv: () => invoke<string>("export_watchlist_csv"),
  exportInventoryCsv: (seasonId: string, marketMode: string) =>
    invoke<string>("export_inventory_csv", { seasonId, marketMode }),
  exportBuyWatchesCsv: (seasonId: string, marketMode: string) =>
    invoke<string>("export_buy_watches_csv", { seasonId, marketMode }),

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
      strategyId,
      sectionId,
      itemId,
      ruleType,
      threshold,
      cooldownSeconds,
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
  maintainDatabase: () => invoke<DatabaseMaintenanceResult>("maintain_database"),
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

  syncFireBatch: (params: {
    season_id: string;
    market_mode: string;
    records: Array<{
      season_id: string;
      market_mode: string;
      rmb_per_10k_fire: number;
      fire_per_rmb: number;
      increase_ratio: number;
      trading_volume: string;
      source: string;
      source_time: string;
      recorded_at: number;
    }>;
  }) => invoke<{ success: boolean; message?: string }>("sync_fire_batch", { params }),

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

  syncItemsBatch: (params: {
    season_id: string;
    market_mode: string;
    items: Array<{
      season_id: string;
      market_mode: string;
      item_id: string;
      name: string;
      item_type: string | null;
      price: number;
      last_time: number | null;
      recorded_at: number;
    }>;
  }) => invoke<{ success: boolean; message?: string }>("sync_items_batch", { params }),

  fastSyncItems: (params: {
    server_url: string;
    season_id: string;
    market_mode: string;
    range_days: number;
  }) => invoke<{
    total_items: number;
    total_days: number;
    total_records: number;
    inserted: number;
    elapsed_ms: number;
  }>("fast_sync_items", {
    serverUrl: params.server_url,
    seasonId: params.season_id,
    marketMode: params.market_mode,
    rangeDays: params.range_days,
  }),

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
  getRealtimeFireChanges: (seasonId: string, marketMode: string) =>
    invoke<FirePriceChangeItem[]>("get_realtime_fire_changes", { seasonId, marketMode }),
  getFirePriceInsight: () =>
    invoke<FirePriceInsight>("get_fire_price_insight"),
  getSeasonSummary: () => invoke<SeasonSummary>("get_season_summary"),
  getSeasonTrends: (hours?: number) =>
    invoke<SeasonTrendHour[]>("get_season_trends", { hours }),
  selectLocalItemsFile: () =>
    invoke<string | null>("select_local_items_file"),
  getAppDataDir: () =>
    invoke<string>("get_app_data_dir"),
  getResourcePath: (resourceName: string) =>
    invoke<string>("get_resource_path", { resourceName }),

  getDealAlerts: () =>
    invoke<{ bargains: DealAlert[]; sells: DealAlert[] }>("get_deal_alerts"),

  // Season management
  listSeasons: () =>
    invoke<SeasonInfo[]>("list_seasons"),
  getSeasonApiConfig: (seasonId: string) =>
    invoke<SeasonApiConfigResponse>("get_season_api_config_cmd", { seasonId }),
  setSeasonApiConfig: (seasonId: string, config: SeasonApiConfigInput) =>
    invoke<OkResponse>("set_season_api_config_cmd", {
      seasonId,
      qiandaoTagIdNormal: config.qiandao_tag_id_normal,
      qiandaoSpecIdNormal: config.qiandao_spec_id_normal,
      qiandaoTagIdExpert: config.qiandao_tag_id_expert,
      qiandaoSpecIdExpert: config.qiandao_spec_id_expert,
      luosiSeasonIdNormal: config.luosi_season_id_normal,
      luosiSeasonIdExpert: config.luosi_season_id_expert,
      etorSeasonIdNormal: config.etor_season_id_normal,
      etorSeasonIdExpert: config.etor_season_id_expert,
    }),

  /**
   * 探测 4 个 API season_id 是否返回实时数据（最近 1 小时有交易）
   */
  probeSeasonApi: (
    luosiSeasonIdNormal: number,
    luosiSeasonIdExpert: number,
    etorSeasonIdNormal: number,
    etorSeasonIdExpert: number,
  ) =>
    invoke<{
      luosi_normal_ok: boolean;
      luosi_normal_latest: number | null;
      luosi_expert_ok: boolean;
      luosi_expert_latest: number | null;
      etor_normal_ok: boolean;
      etor_normal_latest: number | null;
      etor_expert_ok: boolean;
      etor_expert_latest: number | null;
    }>("probe_season_api_cmd", {
      luosiSeasonIdNormal,
      luosiSeasonIdExpert,
      etorSeasonIdNormal,
      etorSeasonIdExpert,
    }),

  /**
   * 切换当前活跃赛季：传入 season_id，自动 is_current=1
   */
  switchCurrentSeason: (seasonId: string) =>
    invoke<OkResponse>("switch_current_season_cmd", { seasonId }),

  /** Create/update a season, persist its API config, and make it current. */
  applySeasonSwitch: (
    seasonId: string,
    seasonName: string,
    startedAt: number,
    config: SeasonApiConfigInput,
  ) =>
    invoke<OkResponse>("apply_season_switch_cmd", {
      seasonId,
      seasonName,
      startedAt,
      config,
    }),

  // Item mapping management
  updateItemMapping: () =>
    invoke<ItemMappingUpdateResult>("update_item_mapping"),
  getItemMappingCount: () =>
    invoke<number>("get_item_mapping_count"),

  // Skills management
  getInstalledSkills: () => invoke<SkillInfo[]>("get_installed_skills"),

  // OpenClaw chat
  openclawChat: (
    gatewayUrl: string,
    gatewayToken: string,
    text: string,
    context?: string
  ) => invoke<{ success: boolean; message: string; response?: string }>("openclaw_chat", {
    gatewayUrl,
    gatewayToken,
    text,
    context,
  }),

  // Strategy Detail management
  getStrategyDetails: () => invoke<StrategyDetail[]>("get_strategy_details"),
  getStrategyWithCosts: (id: string) =>
    invoke<StrategyWithCosts | null>("get_strategy_with_costs", { id }),
  getAllStrategiesWithCosts: (marketMode: string) =>
    invoke<StrategyWithCosts[]>("get_all_strategies_with_costs", { marketMode }),
  createStrategyDetail: (req: CreateStrategyRequest) =>
    invoke<string>("create_strategy_detail", { req }),
  updateStrategyDetail: (req: UpdateStrategyRequest) =>
    invoke<OkResponse>("update_strategy_detail", { req }),
  deleteStrategyDetail: (id: string) =>
    invoke<OkResponse>("delete_strategy_detail", { id }),
  getStrategyCosts: (strategyId: string) =>
    invoke<StrategyCost[]>("get_strategy_costs", { strategyId }),
  addStrategyCost: (req: AddCostRequest) =>
    invoke<string>("add_strategy_cost", { req }),
  updateStrategyCost: (req: UpdateCostRequest) =>
    invoke<OkResponse>("update_strategy_cost", { req }),
  deleteStrategyCost: (id: string) =>
    invoke<OkResponse>("delete_strategy_cost", { id }),
  getStrategyOutputs: (strategyId: string) =>
    invoke<StrategyOutput[]>("get_strategy_outputs", { strategyId }),
  addStrategyOutput: (req: AddOutputRequest) =>
    invoke<string>("add_strategy_output", { req }),
  updateStrategyOutput: (req: UpdateOutputRequest) =>
    invoke<OkResponse>("update_strategy_output", { req }),
  deleteStrategyOutput: (id: string) =>
    invoke<OkResponse>("delete_strategy_output", { id }),
  refreshStrategyFirePrices: (strategyId: string) =>
    invoke<StrategyWithCosts>("refresh_strategy_fire_prices", { strategyId }),

  // Arbitrage (套利比价) commands
  getArbitrageRecipes: () => invoke<ArbitrageRecipe[]>("get_arbitrage_recipes"),
  getArbitrageRecipeDetail: (recipeId: string) =>
    invoke<ArbitrageRecipeWithDetails | null>("get_arbitrage_recipe_detail", { recipeId }),
  createArbitrageRecipe: (request: CreateRecipeRequest) =>
    invoke<string>("create_arbitrage_recipe", { request }),
  updateArbitrageRecipe: (recipeId: string, request: UpdateRecipeRequest) =>
    invoke<OkResponse>("update_arbitrage_recipe", { recipeId, request }),
  updateArbitrageIngredients: (recipeId: string, request: UpdateIngredientsRequest) =>
    invoke<OkResponse>("update_arbitrage_ingredients", { recipeId, request }),
  updateArbitrageOutputs: (recipeId: string, request: UpdateOutputsRequest) =>
    invoke<OkResponse>("update_arbitrage_outputs", { recipeId, request }),
  deleteArbitrageRecipe: (recipeId: string) =>
    invoke<OkResponse>("delete_arbitrage_recipe", { recipeId }),
  calculateArbitrage: (seasonId?: string, marketMode?: string, showAll?: boolean) =>
    invoke<ArbitrageResponse>("calculate_arbitrage", { seasonId, marketMode, showAll }),
  searchItemsForArbitrage: (keyword: string) =>
    invoke<ItemSearchResult[]>("search_items_for_arbitrage", { keyword }),
  getArbitrageItemPrice: (itemId: string) =>
    invoke<number | null>("get_arbitrage_item_price", { itemId }),
  toggleArbitrageRecipeEnabled: (recipeId: string, enabled: boolean) =>
    invoke<OkResponse>("toggle_arbitrage_recipe_enabled", { recipeId, enabled }),
  exportArbitrageRecipesCsv: () =>
    invoke<string>("export_arbitrage_recipes_csv"),
  importArbitrageRecipesCsv: (content: string) =>
    invoke<ImportResp>("import_arbitrage_recipes_csv", { content }),
  importInventoryCsv: (content: string) =>
    invoke<ImportResp>("import_inventory_csv", { content }),
  importBuyWatchesCsv: (content: string) =>
    invoke<ImportResp>("import_buy_watches_csv", { content }),
  exportAlertRulesCsv: () => invoke<string>("export_alert_rules_csv"),
  importAlertRulesCsv: (content: string) =>
    invoke<ImportResp>("import_alert_rules_csv", { content }),
  exportStrategiesCsv: () => invoke<string>("export_strategies_csv"),
  importStrategiesCsv: (content: string) =>
    invoke<ImportResp>("import_strategies_csv", { content }),
  exportSeasonsCsv: () => invoke<string>("export_seasons_csv"),
  importSeasonsCsv: (content: string) =>
    invoke<ImportResp>("import_seasons_csv", { content }),
  importFireHistoryCsv: (content: string) =>
    invoke<ImportResp>("import_fire_history_csv", { content }),

  // Window mode commands
  getWindowModeState: () => invoke<WindowModeState>("get_window_mode_state"),
  setMiniWindowMode: (enabled: boolean) =>
    invoke<OkResponse>("set_mini_window_mode", { enabled }),
  setWindowOpacity: (opacity: number) =>
    invoke<OkResponse>("set_window_opacity", { opacity }),
  saveWindowLayout: (x?: number, y?: number, width?: number, height?: number) =>
    invoke<OkResponse>("save_window_layout", { x, y, width, height }),

  // Inventory commands
  listInventoryPositions: (seasonId: string, marketMode: string) =>
    invoke<InventoryPositionView[]>("list_inventory_positions", { seasonId, marketMode }),
  createInventoryPosition: (request: CreatePositionRequest) =>
    invoke<OkResponse>("create_inventory_position", { request }),
  updateInventoryPosition: (request: UpdatePositionRequest) =>
    invoke<OkResponse>("update_inventory_position", { request }),
  deleteInventoryPosition: (id: string) =>
    invoke<OkResponse>("delete_inventory_position", { id }),
  markInventorySold: (id: string, soldPrice: number) =>
    invoke<OkResponse>("mark_inventory_sold", { id, soldPrice }),
  markInventoryIgnored: (id: string) =>
    invoke<OkResponse>("mark_inventory_ignored", { id }),
  getInventorySummary: (seasonId: string, marketMode: string) =>
    invoke<InventorySummary>("get_inventory_summary", { seasonId, marketMode }),
  getSellReadyPositions: (seasonId: string, marketMode: string) =>
    invoke<InventoryPositionView[]>("get_sell_ready_positions", { seasonId, marketMode }),
  listInventoryBuyWatches: (seasonId: string, marketMode: string) =>
    invoke<InventoryBuyWatchView[]>("list_inventory_buy_watches", { seasonId, marketMode }),
  createInventoryBuyWatch: (request: CreateBuyWatchRequest) =>
    invoke<OkResponse>("create_inventory_buy_watch", { request }),
  updateInventoryBuyWatch: (request: UpdateBuyWatchRequest) =>
    invoke<OkResponse>("update_inventory_buy_watch", { request }),
  deleteInventoryBuyWatch: (id: string) =>
    invoke<OkResponse>("delete_inventory_buy_watch", { id }),
  getBuyReadyWatches: (seasonId: string, marketMode: string) =>
    invoke<InventoryBuyWatchView[]>("get_buy_ready_watches", { seasonId, marketMode }),

  getMiniWindowFeed: (seasonId?: string, marketMode?: string) =>
    invoke<MiniWindowFeed>("get_mini_window_feed", { seasonId, marketMode }),

  healthCheck: () => invoke<HealthStatus>("health_check"),
};

export interface MiniWindowFeed {
  worth_items: MiniWorthItem[];
  profitable_arbitrage: ArbitrageCalculationResult[];
  buy_ready_watches: InventoryBuyWatchView[];
  sell_ready_positions: InventoryPositionView[];
  updated_at: number;
}

export interface MiniWorthItem {
  item_id: string;
  item_name: string;
  section_name: string;
  current_price: number | null;
  purchase_fire_price: number;
  count: number;
  profit: number | null;
  is_worth: boolean;
}

export interface ArbitrageCalculationResult {
  recipe_id: string;
  recipe_name: string;
  recipe_type: string;
  total_cost: number;
  total_output_value: number;
  profit: number;
  profit_margin: number;
  ingredients_detail: IngredientCostDetail[];
  outputs_detail: OutputRevenueDetail[];
  is_profitable: boolean;
  used_lowest_price: boolean;
}

export interface IngredientCostDetail {
  item_name: string;
  count: number;
  unit_price: number;
  total_cost: number;
}

export interface OutputRevenueDetail {
  item_name: string;
  count: number;
  unit_price: number;
  total_value: number;
  after_tax_value: number;
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
  etor_season_id_normal: number;
  etor_season_id_expert: number;
}

export interface SeasonApiConfigInput {
  qiandao_tag_id_normal: string;
  qiandao_spec_id_normal: string;
  qiandao_tag_id_expert: string;
  qiandao_spec_id_expert: string;
  luosi_season_id_normal: number;
  luosi_season_id_expert: number;
  etor_season_id_normal: number;
  etor_season_id_expert: number;
}

export interface ItemMappingUpdateResult {
  total: number;
  new_from_luosi: number;
  new_from_etor: number;
  updated: number;
  deduplicated: number;
}

// Inventory types
export interface InventoryPosition {
  id: string;
  season_id: string;
  market_mode: string;
  item_id: string;
  item_name: string;
  item_type: string;
  buy_price: number;
  quantity: number;
  extra_cost: number;
  fee_rate: number;
  target_sell_price: number | null;
  bought_at: number;
  status: string;
  sold_price: number | null;
  sold_at: number | null;
  note: string;
  alert_enabled: boolean;
  last_alert_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface InventoryPositionView {
  position: InventoryPosition;
  current_price: number | null;
  break_even_price: number;
  total_cost: number;
  estimated_net_value: number | null;
  profit: number | null;
  profit_ratio: number | null;
  sell_signal: string;
}

export interface InventoryBuyWatch {
  id: string;
  season_id: string;
  market_mode: string;
  item_id: string;
  item_name: string;
  item_type: string;
  target_buy_price: number;
  max_quantity: number | null;
  note: string;
  alert_enabled: boolean;
  auto_create_position: boolean;
  last_alert_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface InventoryBuyWatchView {
  watch: InventoryBuyWatch;
  current_price: number | null;
  discount_to_target: number | null;
  buy_signal: string;
}

export interface InventorySummary {
  total_cost: number;
  current_value: number;
  profit: number;
  sell_ready_count: number;
  buy_ready_count: number;
  loss_risk_count: number;
  holding_count: number;
}

export interface CreatePositionRequest {
  season_id: string;
  market_mode: string;
  item_id: string;
  item_name: string;
  item_type?: string;
  buy_price: number;
  quantity: number;
  extra_cost?: number;
  fee_rate?: number;
  target_sell_price?: number;
  bought_at?: number;
  note?: string;
}

export interface UpdatePositionRequest {
  id: string;
  item_name?: string;
  item_type?: string;
  buy_price?: number;
  quantity?: number;
  extra_cost?: number;
  fee_rate?: number;
  target_sell_price?: number;
  bought_at?: number;
  note?: string;
  alert_enabled?: boolean;
}

export interface CreateBuyWatchRequest {
  season_id: string;
  market_mode: string;
  item_id: string;
  item_name: string;
  item_type?: string;
  target_buy_price: number;
  max_quantity?: number;
  note?: string;
  auto_create_position?: boolean;
}

export interface UpdateBuyWatchRequest {
  id: string;
  item_name?: string;
  item_type?: string;
  target_buy_price?: number;
  max_quantity?: number;
  note?: string;
  alert_enabled?: boolean;
  auto_create_position?: boolean;
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

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: 'system' | 'workspace';
  enabled: boolean;
}

export interface StrategyDetail {
  id: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  estimated_cost: number;
  estimated_revenue_min: number;
  estimated_revenue_max: number;
  runs_per_hour: number;
  remark: string | null;
  created_at: number;
  updated_at: number;
}

export interface StrategyCost {
  id: string;
  strategy_id: string;
  cost_type: string;
  item_id: string;
  item_name: string | null;
  count: number;
  fire_price: number;
  total_fire: number;
  is_realtime: boolean;
  created_at: number;
  updated_at: number;
}

export interface StrategyOutput {
  id: string;
  strategy_id: string;
  item_name: string;
  item_type: string;
  count: number;
  estimated_value: number;
  realtime_value: number;
  remark: string | null;
  created_at: number;
  updated_at: number;
}

export interface StrategyWithCosts {
  id: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  estimated_cost: number;
  estimated_revenue_min: number;
  estimated_revenue_max: number;
  runs_per_hour: number;
  remark: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
  costs: StrategyCost[];
  outputs: StrategyOutput[];
  total_cost_fire: number;
  total_output_value: number;
  hourly_cost_fire: number;
  profit_ratio: number;
}

export interface CreateStrategyRequest {
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  estimated_cost: number;
  estimated_revenue_min: number;
  estimated_revenue_max: number;
  runs_per_hour: number;
  remark: string | null;
  image_url: string | null;
}

export interface UpdateStrategyRequest {
  id: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  estimated_cost: number;
  estimated_revenue_min: number;
  estimated_revenue_max: number;
  runs_per_hour: number;
  remark: string | null;
  image_url: string | null;
}

export interface AddCostRequest {
  strategy_id: string;
  cost_type: string;
  item_id: string;
  item_name: string | null;
  count: number;
  is_realtime: boolean;
}

export interface AddOutputRequest {
  strategy_id: string;
  item_name: string;
  item_type: string;
  count: number;
  estimated_value: number;
  remark: string | null;
}

export interface UpdateCostRequest {
  id: string;
  count: number;
  is_realtime: boolean;
}

export interface UpdateOutputRequest {
  id: string;
  count: number;
  estimated_value: number;
  remark: string | null;
}

export interface ScrapeMode {
  mode: "normal" | "expert";
  enabled: boolean;
}

export interface ServerApiConfig {
  qiandao_tag_id_normal: string;
  qiandao_spec_id_normal: string;
  qiandao_tag_id_expert: string;
  qiandao_spec_id_expert: string;
  luosi_season_id_normal: number;
  luosi_season_id_expert: number;
  etor_season_id_normal: number;
  etor_season_id_expert: number;
}

export interface ServerFullConfig {
  season_id: string;
  http_port: number;
  cors_allowed_origins: string[];
  rate_limit: {
    enabled: boolean;
    requests_per_minute: number;
    burst_size: number;
  };
  api_config: ServerApiConfig;
  scrape_modes: ScrapeMode[];
}

export interface ServerAdminResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export const serverAdmin = {
  getApiConfig: async (serverUrl: string, password: string, _signal?: AbortSignal) => {
    const data = await cmd.postServerJson<ServerAdminResponse>(`${serverUrl}/api/admin/config`, { password });
    if (!data.success) throw new Error(data.error || "获取配置失败");
    return data.data as ServerFullConfig;
  },

  initSeason: async (serverUrl: string, password: string, seasonId: string, startedAt: number, seasonName?: string, _signal?: AbortSignal) => {
    const data = await cmd.postServerJson<ServerAdminResponse>(`${serverUrl}/admin/init-season`, {
      password,
      season_id: seasonId,
      started_at: startedAt,
      season_name: seasonName,
    });
    if (!data.success) throw new Error(data.error || "初始化失败");
    return data.data;
  },

  updateApiConfig: async (serverUrl: string, password: string, apiConfig: ServerApiConfig, _signal?: AbortSignal) => {
    const data = await cmd.postServerJson<ServerAdminResponse>(`${serverUrl}/admin/update-api-config`, {
      password,
      api_config: apiConfig,
    });
    if (!data.success) throw new Error(data.error || "更新配置失败");
    return data.data;
  },

  updateScrapeModes: async (serverUrl: string, password: string, scrapeModes: ScrapeMode[], _signal?: AbortSignal) => {
    const data = await cmd.postServerJson<ServerAdminResponse>(`${serverUrl}/api/admin/update-config`, {
      password,
      scrape_modes: scrapeModes,
    });
    if (!data.success) throw new Error(data.error || "更新采集模式失败");
    return data.data;
  },
};

// ============================================================================
// Arbitrage (套利比价) Types
// ============================================================================

export interface ArbitrageRecipe {
  id: string;
  name: string;
  recipe_type: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ArbitrageIngredient {
  id: string;
  recipe_id: string;
  item_id: string;
  item_name: string | null;
  count: number;
  created_at: number;
  updated_at: number;
}

export interface ArbitrageOutput {
  id: string;
  recipe_id: string;
  item_id: string;
  item_name: string | null;
  count: number;
  created_at: number;
  updated_at: number;
}

export interface ArbitrageRecipeWithDetails {
  recipe: ArbitrageRecipe;
  ingredients: ArbitrageIngredient[];
  outputs: ArbitrageOutput[];
}

export interface IngredientCostDetail {
  item_id: string;
  item_name: string;
  count: number;
  unit_price: number;
  total_cost: number;
}

export interface OutputRevenueDetail {
  item_id: string;
  item_name: string;
  count: number;
  unit_price: number;
  total_value: number;
  after_tax_value: number;
}

export interface ArbitrageCalculationResult {
  recipe_id: string;
  recipe_name: string;
  recipe_type: string;
  total_cost: number;
  total_output_value: number;
  profit: number;
  profit_margin: number;
  ingredients_detail: IngredientCostDetail[];
  outputs_detail: OutputRevenueDetail[];
  is_profitable: boolean;
  used_lowest_price: boolean;
}

export interface ArbitrageResponse {
  recipes: ArbitrageCalculationResult[];
  calculated_at: number;
  total_profitable: number;
  total_loss: number;
}

export interface ItemSearchResult {
  item_id: string;
  name: string;
  item_type: string;
  price: number;
}

export interface CreateIngredientRequest {
  item_name: string;
  count: number;
}

export interface CreateOutputRequest {
  item_name: string;
  count: number;
}

export interface CreateRecipeRequest {
  name: string;
  recipe_type: string;
  enabled: boolean;
  ingredients: CreateIngredientRequest[];
  outputs: CreateOutputRequest[];
}

export interface UpdateRecipeRequest {
  name?: string;
  recipe_type?: string;
  enabled?: boolean;
}

export interface UpdateIngredientsRequest {
  ingredients: CreateIngredientRequest[];
}

export interface UpdateOutputsRequest {
  outputs: CreateOutputRequest[];
}

// ==================== 高效数据同步类型 ====================

export interface FastSyncResponse {
  items: FastItemData[];
  total_items: number;
  total_days: number;
  generated_at: number;
}

export interface FastItemData {
  item_id: string;
  name: string;
  daily_prices: DayPrice[];
}

export interface DayPrice {
  day: number;
  open: number;
  close: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface LatestPricesResponse {
  prices: LatestPrice[];
  scraped_at: number;
}

export interface LatestPrice {
  item_id: string;
  name: string;
  fire_price: number;
  season_day: number;
}

export interface DualSourceItem {
  item_id: string;
  name: string;
  current_price: number;
  price_24h_ago: number | null;
  last_time: number;
  source: string;
}

export interface DualSourceHistoryPoint {
  ts: number;
  price: number;
  source: string;
}
