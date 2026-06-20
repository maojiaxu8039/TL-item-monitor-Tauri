import { describe, it, expect } from "vitest";

describe("API Response Types", () => {
  it("validates FastSyncResponse structure", () => {
    interface FastSyncResponse {
      items: FastItemData[];
      total_items: number;
      total_days: number;
      generated_at: number;
    }

    interface FastItemData {
      item_id: string;
      name: string;
      daily_prices: DayPrice[];
    }

    interface DayPrice {
      day: number;
      open: number;
      close: number;
      min: number;
      max: number;
      avg: number;
      count: number;
    }

    const mockResponse: FastSyncResponse = {
      items: [
        {
          item_id: "item_001",
          name: "测试物品",
          daily_prices: [
            { day: 1, open: 1000, close: 1100, min: 1000, max: 1100, avg: 1050, count: 5 },
            { day: 2, open: 1100, close: 1200, min: 1050, max: 1200, avg: 1125, count: 8 },
          ],
        },
      ],
      total_items: 1,
      total_days: 70,
      generated_at: Date.now(),
    };

    expect(mockResponse.items.length).toBe(1);
    expect(mockResponse.total_items).toBe(1);
    expect(mockResponse.total_days).toBe(70);
    expect(mockResponse.items[0].daily_prices.length).toBe(2);
  });

  it("validates LatestPricesResponse structure", () => {
    interface LatestPricesResponse {
      prices: LatestPrice[];
      scraped_at: number;
    }

    interface LatestPrice {
      item_id: string;
      name: string;
      fire_price: number;
      season_day: number;
    }

    const mockResponse: LatestPricesResponse = {
      prices: [
        { item_id: "item_001", name: "物品A", fire_price: 1100, season_day: 70 },
        { item_id: "item_002", name: "物品B", fire_price: 2200, season_day: 70 },
      ],
      scraped_at: Date.now(),
    };

    expect(mockResponse.prices.length).toBe(2);
    expect(mockResponse.prices[0].fire_price).toBe(1100);
  });
});

describe("MiniWindow Feed Types", () => {
  it("validates MiniWorthItem structure", () => {
    interface MiniWorthItem {
      item_id: string;
      item_name: string;
      current_price: number;
      purchase_fire_price: number;
      count: number;
      profit?: number;
    }

    const mockItem: MiniWorthItem = {
      item_id: "item_001",
      item_name: "值得买物品",
      current_price: 1100,
      purchase_fire_price: 1000,
      count: 5,
      profit: 500,
    };

    expect(mockItem.item_id).toBe("item_001");
    expect(mockItem.profit).toBe(500);
    expect(mockItem.current_price).toBeGreaterThan(mockItem.purchase_fire_price);
  });
});

describe("Inventory Types", () => {
  it("validates InventoryPositionView structure", () => {
    interface InventoryPositionView {
      id: string;
      season_id: string;
      market_mode: string;
      item_id: string;
      item_name: string;
      buy_price: number;
      quantity: number;
      target_sell_price: number;
      profit_loss: number;
      profit_loss_percent: number;
      signal: string;
      current_price?: number;
    }

    const mockPosition: InventoryPositionView = {
      id: "pos_001",
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "持仓物品",
      buy_price: 1000,
      quantity: 5,
      target_sell_price: 1200,
      profit_loss: 250,
      profit_loss_percent: 5.0,
      signal: "profitable",
      current_price: 1100,
    };

    expect(mockPosition.quantity).toBe(5);
    expect(mockPosition.signal).toBe("profitable");
    expect(mockPosition.profit_loss_percent).toBeGreaterThan(0);
  });

  it("validates InventoryBuyWatchView structure", () => {
    interface InventoryBuyWatchView {
      watch: BuyWatch;
      current_price: number;
      discount_to_target?: number;
    }

    interface BuyWatch {
      id: string;
      season_id: string;
      market_mode: string;
      item_id: string;
      item_name: string;
      target_buy_price: number;
      signal: string;
    }

    const mockWatch: InventoryBuyWatchView = {
      watch: {
        id: "watch_001",
        season_id: "1401",
        market_mode: "season_normal",
        item_id: "item_001",
        item_name: "监控物品",
        target_buy_price: 800,
        signal: "buy_ready",
      },
      current_price: 900,
      discount_to_target: 12.5,
    };

    expect(mockWatch.watch.signal).toBe("buy_ready");
    expect(mockWatch.discount_to_target).toBe(12.5);
  });
});

describe("Arbitrage Types", () => {
  it("validates ArbitrageCalculationResult structure", () => {
    interface ArbitrageIngredient {
      item_id: string;
      item_name: string;
      count: number;
      fire_price: number;
    }

    interface ArbitrageOutput {
      item_id: string;
      item_name: string;
      count: number;
      fire_price: number;
    }

    interface ArbitrageCalculationResult {
      recipe_id: string;
      recipe_name: string;
      ingredients: ArbitrageIngredient[];
      outputs: ArbitrageOutput[];
      input_fire: number;
      output_fire: number;
      profit_fire: number;
      profit_percent: number;
    }

    const mockResult: ArbitrageCalculationResult = {
      recipe_id: "recipe_001",
      recipe_name: "测试配方",
      ingredients: [
        { item_id: "mat_001", item_name: "材料A", count: 10, fire_price: 100 },
      ],
      outputs: [
        { item_id: "result_001", item_name: "产物A", count: 1, fire_price: 1500 },
      ],
      input_fire: 1000,
      output_fire: 1500,
      profit_fire: 500,
      profit_percent: 50.0,
    };

    expect(mockResult.profit_fire).toBeGreaterThan(0);
    expect(mockResult.profit_percent).toBe(50.0);
    expect(mockResult.ingredients.length).toBe(1);
    expect(mockResult.outputs.length).toBe(1);
  });
});

describe("URL Query Parameter Building", () => {
  it("builds sync-fast query parameters correctly", () => {
    const params = new URLSearchParams({
      season: "1401",
      mode: "normal",
      min_day: "1",
      max_day: "70",
    });

    expect(params.toString()).toContain("season=1401");
    expect(params.toString()).toContain("mode=normal");
    expect(params.toString()).toContain("min_day=1");
    expect(params.toString()).toContain("max_day=70");
  });

  it("builds cursor-based pagination correctly", () => {
    const timestamp = 1700000000;
    const id = 12345;
    const cursor = `${timestamp},${id}`;

    expect(cursor).toBe("1700000000,12345");

    const [ts, dbId] = cursor.split(",").map(Number);
    expect(ts).toBe(1700000000);
    expect(dbId).toBe(12345);
  });
});
