#!/bin/bash
# 批量修复浅色样式为深色主题

cd /Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/src/components/dashboard

# 修复背景色
sed -i '' 's/bg-white/bg-[var(--color-panel)]/g' *.tsx
sed -i '' 's/bg-slate-50/bg-[var(--color-panel-soft)]/g' *.tsx
sed -i '' 's/bg-slate-100/bg-[var(--color-panel)]/g' *.tsx
sed -i '' 's/bg-gray-50/bg-[var(--color-panel-soft)]/g' *.tsx
sed -i '' 's/bg-gray-100/bg-[var(--color-panel)]/g' *.tsx
sed -i '' 's/bg-blue-50/bg-[rgba(255,184,0,0.08)]/g' *.tsx
sed -i '' 's/bg-red-50/bg-[rgba(239,68,68,0.1)]/g' *.tsx
sed -i '' 's/bg-green-50/bg-[rgba(34,197,94,0.1)]/g' *.tsx
sed -i '' 's/bg-purple-50/bg-[rgba(167,139,250,0.12)]/g' *.tsx

# 修复文字色
sed -i '' 's/text-slate-800/text-[var(--color-text)]/g' *.tsx
sed -i '' 's/text-slate-700/text-[var(--color-text)]/g' *.tsx
sed -i '' 's/text-slate-600/text-[var(--color-text-muted)]/g' *.tsx
sed -i '' 's/text-slate-500/text-[var(--color-text-subtle)]/g' *.tsx
sed -i '' 's/text-slate-400/text-[var(--color-text-subtle)]/g' *.tsx
sed -i '' 's/text-gray-600/text-[var(--color-text-muted)]/g' *.tsx
sed -i '' 's/text-gray-700/text-[var(--color-text)]/g' *.tsx

# 修复边框色
sed -i '' 's/border-slate-200/border-[var(--color-border)]/g' *.tsx
sed -i '' 's/border-slate-100/border-[var(--color-border-soft)]/g' *.tsx
sed -i '' 's/border-slate-300/border-[var(--color-border)]/g' *.tsx
sed -i '' 's/border-gray-200/border-[var(--color-border)]/g' *.tsx
sed -i '' 's/border-red-100/border-[rgba(239,68,68,0.2)]/g' *.tsx

# 修复蓝色系
sed -i '' 's/ring-blue-500\/30/ring-[var(--color-brand)]\/30/g' *.tsx
sed -i '' 's/text-blue-500/text-[var(--color-brand)]/g' *.tsx
sed -i '' 's/bg-blue-50/bg-[rgba(255,184,0,0.08)]/g' *.tsx

echo "修复完成！"
