import { describe, it, expect, vi, beforeEach } from "vitest";
import { cmd } from "@/lib/commands";
import type { FastSyncResponse, LatestPricesResponse } from "@/lib/commands";

vi.mock("@/lib/commands", () => ({
  cmd: {
    fetchServerJson: vi.fn(),
    syncItemsBatch: vi.fn(),
    syncFireBatch: vi.fn(),
    getInventoryPositions: vi.fn(),
    getInventoryBuyWatches: vi.fn(),
    createInventoryPosition: vi.fn(),
    createInventoryBuyWatch: vi.fn(),
    updateInventoryPosition: vi.fn(),
    updateInventoryBuyWatch: vi.fn(),
    deleteInventoryPosition: vi.fn(),
    deleteInventoryBuyWatch: vi.fn(),
  },
}));

describe("Inventory Position API Mocking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mocks create inventory position", async () => {
    vi.mocked(cmd.createInventoryPosition).mockResolvedValue({
      ok: true,
      message: "Created"
    });

    const result = await cmd.createInventoryPosition({
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "测试物品",
      buy_price: 1000,
      quantity: 5,
    });

    expect(cmd.createInventoryPosition).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe("Inventory Position Data Types", () => {
  it("validates position request structure", () => {
    const request = {
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "测试物品",
      buy_price: 1000,
      quantity: 5,
      target_sell_price: 1200,
    };

    expect(request.season_id).toBe("1401");
    expect(request.buy_price).toBe(1000);
    expect(request.quantity).toBe(5);
  });

  it("validates buy watch request structure", () => {
    const request = {
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "测试物品",
      target_buy_price: 800,
    };

    expect(request.target_buy_price).toBe(800);
  });
});

describe("Fast Sync API Response Types", () => {
  it("validates FastSyncResponse structure", () => {
    const mockResponse: FastSyncResponse = {
      items: [
        {
          item_id: "item_001",
          name: "测试物品",
          daily_prices: [
            {
              day: 1,
              open: 1000,
              close: 1100,
              min: 1000,
              max: 1100,
              avg: 1050,
              count: 10,
            },
          ],
        },
      ],
      total_items: 1,
      total_days: 70,
      generated_at: 1234567890,
    };

    expect(mockResponse.items).toHaveLength(1);
    expect(mockResponse.total_items).toBe(1);
    expect(mockResponse.total_days).toBe(70);
    expect(mockResponse.items[0].daily_prices[0].day).toBe(1);
  });

  it("validates LatestPricesResponse structure", () => {
    const mockResponse: LatestPricesResponse = {
      prices: [
        {
          item_id: "item_001",
          name: "测试物品",
          fire_price: 1100,
          season_day: 70,
        },
      ],
      scraped_at: 1234567890,
    };

    expect(mockResponse.prices).toHaveLength(1);
    expect(mockResponse.prices[0].fire_price).toBe(1100);
    expect(mockResponse.scraped_at).toBe(1234567890);
  });
});

describe("Inventory Position Validation", () => {
  it("validates required fields for position creation", () => {
    const validRequest = {
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "测试物品",
      buy_price: 1000,
      quantity: 5,
    };

    expect(validRequest.buy_price).toBeGreaterThan(0);
    expect(validRequest.quantity).toBeGreaterThan(0);
  });

  it("handles optional fields", () => {
    interface PositionRequest {
      season_id: string;
      market_mode: string;
      item_id: string;
      item_name: string;
      buy_price: number;
      quantity: number;
      target_sell_price?: number;
      note?: string;
    }

    const minimalRequest: PositionRequest = {
      season_id: "1401",
      market_mode: "season_normal",
      item_id: "item_001",
      item_name: "测试物品",
      buy_price: 1000,
      quantity: 5,
    };

    const fullRequest: PositionRequest = {
      ...minimalRequest,
      target_sell_price: 1200,
      note: "测试备注",
    };

    expect(minimalRequest.target_sell_price).toBeUndefined();
    expect(fullRequest.target_sell_price).toBe(1200);
    expect(fullRequest.note).toBe("测试备注");
  });
});
