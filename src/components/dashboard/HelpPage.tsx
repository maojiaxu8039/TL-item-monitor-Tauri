import { CircleHelp, ExternalLink, MessageSquare, Info } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/button";

export default function HelpPage() {
  const faqs = [
    {
      q: "如何开始使用？",
      a: "首次使用请先在「软件设置」中配置火价抓取间隔和物品数据源，然后就可以在「监控首页」查看火价和添加关注的物品了。",
    },
    {
      q: "什么是赛季普通/专家模式？",
      a: "普通模式和专家模式是游戏内两种不同的物价系统。你可以在顶部切换模式，不同模式下的火价和物品价格会分别显示。",
    },
    {
      q: "如何添加关注的物品？",
      a: "在「监控首页」点击「添加物品」，搜索你想要的物品，设置购买火价和数量，然后添加到你的板块中。系统会自动评估物品的性价比。",
    },
    {
      q: "什么是 Worth 评估？",
      a: "系统会根据你设置的购买火价和物品当前火价，评估物品是否值得购买：可买（绿色）、可考虑（橙色）、不值（红色）。",
    },
    {
      q: "如何设置价格预警？",
      a: "当前可在「设置」中开启价格预警弹窗并配置冷却时间。独立的预警规则管理页面尚未开放。",
    },
    {
      q: "如何备份和恢复数据？",
      a: "在「导入导出」页面，你可以导出关注列表 CSV、备份整个数据库。如果需要恢复，使用「恢复数据库」功能选择之前备份的文件。",
    },
    {
      q: "托盘模式有什么用？",
      a: "关闭窗口后，应用会在系统托盘继续运行，继续监控火价和发送预警。你可以在托盘图标上右键点击来恢复窗口或退出应用。",
    },
    {
      q: "数据来源是什么？",
      a: "火价数据来自千岛交易平台 API，物品数据来自刷图小助手。你可以在「数据监控」页面查看服务器状态和同步数据。",
    },
  ];

  return (
    <PageShell size="lg" className="space-y-5">
      <PageHeader
        title="帮助文档"
        description="使用说明和常见问题解答"
        icon={CircleHelp}
        iconBg="bg-blue-50"
        iconColor="text-[var(--color-brand)]"
      />

      <Surface padding="md" className="bg-blue-50 border-[var(--color-brand)]/30">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-[var(--color-brand)] mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900">版本信息</h3>
            <p className="text-blue-700 text-sm mt-1">
              TorchScan v2.0.0 · 基于 Tauri 2 + React 构建
            </p>
          </div>
        </div>
      </Surface>

      <Surface padding="md">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">常见问题</h2>
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <h3 className="font-medium text-slate-700 mb-1">Q: {faq.q}</h3>
              <p className="text-sm text-slate-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">快捷键</h2>
        <div className="space-y-2">
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">刷新火价</span>
            <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">Ctrl + R</kbd>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">打开搜索</span>
            <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">Ctrl + K</kbd>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-slate-600">最小化到托盘</span>
            <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">Ctrl + W</kbd>
          </div>
        </div>
      </Surface>

      <div className="flex gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("https://github.com", "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-1.5" />
          GitHub
        </Button>
        <Button
          size="sm"
          onClick={() => window.open("https://discord.com", "_blank")}
        >
          <MessageSquare className="h-4 w-4 mr-1.5" />
          加入讨论
        </Button>
      </div>
    </PageShell>
  );
}