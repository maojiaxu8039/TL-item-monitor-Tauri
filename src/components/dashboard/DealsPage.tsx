import { Tag, Construction } from "lucide-react";

export default function DealsPage() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-green-500" />
            捡漏出货
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">物品价格异动监控（开发中）</p>
        </div>
      </div>

      {/* Placeholder */}
      <div className="bg-white rounded-lg border border-slate-200 py-24 text-center">
        <Construction className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <div className="text-sm text-slate-500 mb-2">捡漏出货功能开发中</div>
        <div className="text-xs text-slate-400 max-w-md mx-auto">
          即将推出物品价格异动监控功能，
          <br />
          当关注的物品价格波动上涨或下跌幅度超过设定阈值时，
          <br />
          自动提醒用户购买或出售。
        </div>
      </div>
    </div>
  );
}
