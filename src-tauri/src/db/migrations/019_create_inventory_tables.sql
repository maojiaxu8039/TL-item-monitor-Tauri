-- 库存持仓表
CREATE TABLE IF NOT EXISTS inventory_positions (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  market_mode TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  buy_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  extra_cost REAL NOT NULL DEFAULT 0,
  fee_rate REAL NOT NULL DEFAULT 0.125,
  target_sell_price REAL,
  bought_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'holding',
  sold_price REAL,
  sold_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  alert_enabled INTEGER NOT NULL DEFAULT 1,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_context
ON inventory_positions(season_id, market_mode, status);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_item
ON inventory_positions(item_id, item_name);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_alert
ON inventory_positions(alert_enabled, status);

-- 买入监控表
CREATE TABLE IF NOT EXISTS inventory_buy_watches (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  market_mode TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  target_buy_price REAL NOT NULL,
  max_quantity INTEGER,
  note TEXT NOT NULL DEFAULT '',
  alert_enabled INTEGER NOT NULL DEFAULT 1,
  auto_create_position INTEGER NOT NULL DEFAULT 0,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_context
ON inventory_buy_watches(season_id, market_mode, alert_enabled);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_item
ON inventory_buy_watches(item_id, item_name);
