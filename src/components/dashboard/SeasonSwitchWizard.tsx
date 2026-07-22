import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, Clock, ArrowRight, Database, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cmd, type SeasonInfo } from "@/lib/commands";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateMarketContextData } from "@/lib/queryKeys";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { beijingDateToUnix, beijingToday, calculateSeasonApiIds } from "@/lib/season";

interface SeasonSwitchWizardProps {
  currentSeasonId: string;
  seasons: SeasonInfo[];
}

type ProbeStatus = "live" | "not_open" | "error";
type ProbeEntry = { status: ProbeStatus; latest: number | null; message: string | null };
type ProbeResult = {
  luosi_normal: ProbeEntry;
  luosi_expert: ProbeEntry;
  etor_normal: ProbeEntry;
  etor_expert: ProbeEntry;
  season_open: boolean;
};

const STATUS_LABEL: Record<ProbeStatus, string> = {
  live: "实时",
  not_open: "赛季未开",
  error: "ID 错误",
};

const STATUS_COLOR: Record<ProbeStatus, string> = {
  live: "bg-green-500/10 text-green-700 dark:text-green-300",
  not_open: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const DEFAULT_CONFIG = {
  luosi_season_id_normal: 1501,
  luosi_season_id_expert: 1531,
  etor_season_id_normal: 1501,
  etor_season_id_expert: 1531,
};

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function tsAgeMin(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const ageMin = Math.round((Date.now() - ms) / 60000);
  if (ageMin < 1) return "刚刚";
  if (ageMin < 60) return `${ageMin} 分钟前`;
  const h = Math.floor(ageMin / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function SeasonSwitchWizard({
  currentSeasonId,
  seasons,
}: SeasonSwitchWizardProps) {
  const queryClient = useQueryClient();
  const { marketContext, setMarketContext } = useSectionRefresh();
  const currentNumber = Number.parseInt(currentSeasonId.replace(/^ss/i, ""), 10) || 12;
  const initialTargetNumber = currentNumber + 1;
  const initialIds = calculateSeasonApiIds(initialTargetNumber);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetSeasonNumber, setTargetSeasonNumber] = useState(String(initialTargetNumber));
  const [startDate, setStartDate] = useState(beijingToday());
  const [config, setConfig] = useState({
    ...DEFAULT_CONFIG,
    luosi_season_id_normal: initialIds.normal,
    luosi_season_id_expert: initialIds.expert,
    etor_season_id_normal: initialIds.normal,
    etor_season_id_expert: initialIds.expert,
  });
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const targetSeasonId = `ss${targetSeasonNumber}`;

  // 步骤 2: 探测 API
  const probeMutation = useMutation({
    mutationFn: async () =>
      cmd.probeSeasonApi(
        config.luosi_season_id_normal,
        config.luosi_season_id_expert,
        config.etor_season_id_normal,
        config.etor_season_id_expert,
      ),
    onSuccess: (data) => {
      setProbeResult(data);
      // 普通服实时 → 切换就绪
      const normalLive =
        data.luosi_normal.status === "live" || data.etor_normal.status === "live";
      const expertNotOpen =
        data.luosi_expert.status === "not_open" || data.etor_expert.status === "not_open";
      if (normalLive) {
        toast.success("普通服数据正常，可以切换");
      } else {
        toast.warning("普通服暂无数据，请检查 season_id");
      }
      // 静默提示专家服未开
      if (expertNotOpen) {
        toast.info("专家服未开放（赛季刚开时常有），切换后只采集普通服", {
          duration: 5000,
        });
      }
    },
    onError: (err) => toast.error(`探测失败: ${errorMessage(err)}`),
  });

  // 步骤 3: 一键应用（保存配置 + 切换赛季）
  const applyMutation = useMutation({
    mutationFn: async () => {
      await cmd.applySeasonSwitch(
        targetSeasonId,
        `SS${targetSeasonNumber} 当前赛季`,
        beijingDateToUnix(startDate),
        {
        qiandao_tag_id_normal: "1560053",
        qiandao_spec_id_normal: "267416",
        qiandao_tag_id_expert: "1560053",
        qiandao_spec_id_expert: "267417",
        luosi_season_id_normal: config.luosi_season_id_normal,
        luosi_season_id_expert: config.luosi_season_id_expert,
        etor_season_id_normal: config.etor_season_id_normal,
        etor_season_id_expert: config.etor_season_id_expert,
        },
      );
    },
    onSuccess: () => {
      toast.success("赛季切换完成");
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
      invalidateMarketContextData(queryClient);
      setMarketContext({ ...marketContext, seasonId: targetSeasonId });
      setShowConfirm(false);
    },
    onError: (err) => toast.error(`应用失败: ${errorMessage(err)}`),
  });

  // 自动根据 ss 编号计算合理的默认值
  // SS12 -> normal 1401/expert 1431
  // SS13 -> normal 1501/expert 1531
  // SS14 -> normal 1601/expert 1631
  const handleSeasonIdChange = (value: string) => {
    const num = parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(num) && num > 0) {
      const { normal, expert } = calculateSeasonApiIds(num);
      setTargetSeasonNumber(String(num));
      setProbeResult(null);
      setConfig((c) => ({
        ...c,
        luosi_season_id_normal: normal,
        luosi_season_id_expert: expert,
        etor_season_id_normal: normal,
        etor_season_id_expert: expert,
      }));
    }
  };

  return (
    <Surface className="p-5 border-2 border-dashed border-[var(--color-brand)]/40">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[var(--color-brand)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          赛季切换向导
        </h3>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-4 text-xs text-[var(--color-text-subtle)]">
        {[
          { n: 1, label: "输入" },
          { n: 2, label: "探测" },
          { n: 3, label: "应用" },
        ].map((s, idx) => (
          <span key={s.n} className="flex items-center gap-1">
            <span
              className={`w-5 h-5 rounded-full inline-flex items-center justify-center font-bold ${
                step >= s.n
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-[var(--color-panel)] text-[var(--color-text-subtle)]"
              }`}
            >
              {s.n}
            </span>
            <span>{s.label}</span>
            {idx < 2 && <ArrowRight className="w-3 h-3 mx-1" />}
          </span>
        ))}
      </div>

      {/* Step 1: 输入 season id */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-subtle)]">
            当前赛季：<span className="font-mono font-bold">{currentSeasonId}</span>
            （共 {seasons.length} 个赛季记录）
          </p>
          <div>
            <label className="text-xs text-[var(--color-text-subtle)] block mb-1">
              新赛季编号（仅数字部分，如 13 表示 SS13）
            </label>
            <input
              type="number"
              min={1}
              value={targetSeasonNumber}
              placeholder={String(initialTargetNumber)}
              className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              onChange={(e) => handleSeasonIdChange(e.target.value)}
            />
            <p className="text-[10px] text-[var(--color-text-subtle)] mt-1">
              系统会自动计算 luosi/etor 的 normal 和 expert season_id
            </p>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-subtle)] block mb-1">
              新赛季开服日期（北京时间）
            </label>
            <input
              type="date"
              value={startDate}
              className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="px-2 py-1.5 rounded bg-[var(--color-panel)]">
              <span className="text-[var(--color-text-subtle)]">luosi normal:</span>{" "}
              <span className="font-mono font-bold">{config.luosi_season_id_normal}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--color-panel)]">
              <span className="text-[var(--color-text-subtle)]">luosi expert:</span>{" "}
              <span className="font-mono font-bold">{config.luosi_season_id_expert}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--color-panel)]">
              <span className="text-[var(--color-text-subtle)]">etor normal:</span>{" "}
              <span className="font-mono font-bold">{config.etor_season_id_normal}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--color-panel)]">
              <span className="text-[var(--color-text-subtle)]">etor expert:</span>{" "}
              <span className="font-mono font-bold">{config.etor_season_id_expert}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setStep(2)}
              disabled={
                !config.luosi_season_id_normal ||
                !config.luosi_season_id_expert ||
                !config.etor_season_id_normal ||
                !config.etor_season_id_expert ||
                !targetSeasonNumber ||
                !startDate ||
                targetSeasonId === currentSeasonId
              }
            >
              下一步：探测 API
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: 探测 */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-subtle)]">
            点击"探测"会向 4 个 API 各发一次请求，检查是否返回 1 小时内的实时数据。
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(1)}
            >
              上一步
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => probeMutation.mutate()}
              disabled={probeMutation.isPending}
            >
              {probeMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              探测 API
            </Button>
          </div>

          {probeResult && (
            <div className="space-y-1.5 mt-2">
              {[
                { key: "luosi_normal", label: "刷图小助手 普通服", entry: probeResult.luosi_normal },
                { key: "luosi_expert", label: "刷图小助手 专家服", entry: probeResult.luosi_expert },
                { key: "etor_normal", label: "易火 普通服", entry: probeResult.etor_normal },
                { key: "etor_expert", label: "易火 专家服", entry: probeResult.etor_expert },
              ].map((row) => {
                const status = row.entry.status;
                const Icon =
                  status === "live" ? CheckCircle2
                    : status === "not_open" ? Clock
                    : XCircle;
                const detail =
                  status === "live"
                    ? `${tsAgeMin(row.entry.latest)}实时`
                    : status === "not_open"
                    ? (row.entry.message ?? "赛季/服尚未开放")
                    : (row.entry.message ?? "ID 错误或网络异常");
                return (
                  <div
                    key={row.key}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${STATUS_COLOR[status]}`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium shrink-0">{row.label}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/10 dark:bg-white/10 shrink-0">
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="truncate">{detail}</span>
                    <span className="text-[var(--color-text-subtle)] ml-auto font-mono shrink-0">
                      {formatTs(row.entry.latest)}
                    </span>
                  </div>
                );
              })}

              {/* 专家服未开时给出友好说明 */}
              {(probeResult.luosi_expert.status === "not_open" ||
                probeResult.etor_expert.status === "not_open") &&
                probeResult.season_open && (
                  <div className="mt-2 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium mb-0.5">专家服尚未开放</div>
                      <div className="text-[11px] opacity-80">
                        赛季刚开时专家服通常会晚几天。切换后只采集普通服数据，
                        等专家服开放时再单独启用 scraper。
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

          {probeResult && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(3)}
                disabled={!probeResult.season_open}
              >
                下一步：应用
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: 应用 */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs text-[var(--color-text-subtle)] space-y-1">
            <p>点击"一键应用"会执行：</p>
            <ul className="list-disc list-inside space-y-0.5 pl-2">
              <li>创建或更新目标赛季 {targetSeasonId}</li>
              <li>保存 API 配置到数据库（luosi/etor season_id）</li>
              <li>触发下次刷新（无需重启）</li>
            </ul>
          </div>
          {probeResult && (
            <div className="text-xs space-y-1 px-2 py-1.5 rounded bg-[var(--color-panel)]">
              <div>luosi normal: <span className="font-mono">{config.luosi_season_id_normal}</span></div>
              <div>luosi expert: <span className="font-mono">{config.luosi_season_id_expert}</span></div>
              <div>etor normal: <span className="font-mono">{config.etor_season_id_normal}</span></div>
              <div>etor expert: <span className="font-mono">{config.etor_season_id_expert}</span></div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(2)}
            >
              上一步
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Database className="w-3 h-3 mr-1" />
              )}
              一键应用
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="确认切换赛季"
        message={`将从 ${currentSeasonId} 切换到 ${targetSeasonId}，并保存新赛季 API 配置。是否继续？`}
        confirmText="确认切换"
        cancelText="取消"
        onConfirm={() => applyMutation.mutate()}
        variant="info"
      />
    </Surface>
  );
}
