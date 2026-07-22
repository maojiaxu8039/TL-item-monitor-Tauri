import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { cmd } from "@/lib/commands";

describe("Tauri command bindings", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ ok: true, message: "ok" });
  });

  it("maps season probe arguments to the Rust command", async () => {
    await cmd.probeSeasonApi(1501, 1531, 1501, 1531);

    expect(invokeMock).toHaveBeenCalledWith("probe_season_api_cmd", {
      luosiSeasonIdNormal: 1501,
      luosiSeasonIdExpert: 1531,
      etorSeasonIdNormal: 1501,
      etorSeasonIdExpert: 1531,
    });
  });

  it("maps the complete season switch payload", async () => {
    const config = {
      qiandao_tag_id_normal: "1560053",
      qiandao_spec_id_normal: "267416",
      qiandao_tag_id_expert: "1560053",
      qiandao_spec_id_expert: "267417",
      luosi_season_id_normal: 1501,
      luosi_season_id_expert: 1531,
      etor_season_id_normal: 1501,
      etor_season_id_expert: 1531,
    };

    await cmd.applySeasonSwitch("ss13", "SS13 当前赛季", 1784131200, config);

    expect(invokeMock).toHaveBeenCalledWith("apply_season_switch_cmd", {
      seasonId: "ss13",
      seasonName: "SS13 当前赛季",
      startedAt: 1784131200,
      config,
    });
  });

  it("maps a direct current-season switch", async () => {
    await cmd.switchCurrentSeason("ss13");

    expect(invokeMock).toHaveBeenCalledWith("switch_current_season_cmd", {
      seasonId: "ss13",
    });
  });
});
