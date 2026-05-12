# TL Item Monitor UI Visual Unification Plan

> Purpose: this document is both a product/design plan and an implementation contract for future AI agents.  
> Scope: React/Vite/Tauri frontend under `src/components`, `src/app`, and `src/index.css`.  
> Goal: make the app feel like one coherent desktop data workstation without rewriting business logic.

## 1. Current Diagnosis

The app already has a good base direction: light gray workspace, white panels, blue primary actions, compact desktop density, Lucide icons, Recharts, TanStack Table, and a small local UI layer in `src/components/ui`.

The main issue is not the overall taste. The issue is visual drift:

- Page wrappers are inconsistent. `App.tsx` already adds `main` padding, but many pages add their own `p-6`, causing uneven page edges and visual center.
- Cards, buttons, tabs, filters, empty states, and dialogs are repeatedly hand-written per page.
- There are two toast systems: `sonner` and `ToastContainer`.
- Focus states differ across components and pages. The sidebar can show an orange browser focus outline while the selected state is blue.
- Semantic color use is inconsistent. Blue, amber, green, red, purple, and orange are sometimes used as page brands, sometimes as statuses, sometimes as primary actions.
- Some debug/error details are displayed inside toolbars, for example item compare errors in the filter row.
- Heading scale and page header structure vary by page.

Useful evidence from the current codebase:

- Local UI primitives exist in `src/components/ui`: `Button`, `Input`, `Select`, `Dialog`, `Card`, `ConfirmDialog`, `DangerButton`, `ToastContainer`.
- `Card` and `Button` are present but many pages still use raw `button` and raw `bg-white rounded-* border ...` containers.
- Repeated style patterns are concentrated in `ArbitragePage`, `SettingsPage`, `StrategiesPage`, `ItemsPage`, `FirePriceComparePage`, `DataMonitorPage`, `AlertsPage`, `PriceAnalysisPage`, and `ImportExportPage`.

## 2. Target Visual Direction

The product should read as a compact market monitoring workstation:

- Calm, operational, information-dense.
- White panels on a light neutral canvas.
- Blue is the primary interaction color.
- Orange/red is reserved for brand flame, fire price, rising price, and sell/opportunity alerts.
- Green is reserved for success, low/down, bargain, or buy-side opportunity.
- Amber is warning only.
- Purple is AI/expert/advanced only.

Avoid a marketing-site feel. No decorative hero layouts, no oversized cards, no ornamental backgrounds. The first screen should remain the actual working UI.

## 3. Design Tokens

Centralize these in `src/index.css` and use them through Tailwind-compatible utility classes or small component variants.

### 3.1 Colors

Recommended semantic palette:

- `--color-app-bg`: `#f7f8fb`
- `--color-panel`: `#ffffff`
- `--color-border`: `#e2e8f0`
- `--color-border-soft`: `#eef2f7`
- `--color-text`: `#0f172a`
- `--color-text-muted`: `#64748b`
- `--color-text-subtle`: `#94a3b8`
- `--color-primary`: `#2563eb`
- `--color-primary-soft`: `#eff6ff`
- `--color-brand`: `#f97316`
- `--color-danger`: `#ef4444`
- `--color-success`: `#22c55e`
- `--color-warning`: `#f59e0b`
- `--color-ai`: `#8b5cf6`

Semantic use:

- Primary buttons, selected navigation, active filters: blue.
- Brand icon only: orange/red flame.
- Price up/sell/opportunity: red/orange-red.
- Price down/bargain/success: green.
- Warnings and attention required: amber.
- AI page/gateway: purple, but keep primary actions blue unless the action is AI-specific.

### 3.2 Radius

Use only these radii unless a component has a strong reason:

- `--radius-sm`: `6px` for small badges and table pills.
- `--radius-md`: `8px` for buttons, inputs, selects, tabs, table rows.
- `--radius-lg`: `10px` for regular cards/panels.
- `--radius-xl`: `12px` for dialogs and large panels.

Current project uses many `rounded-xl` and some `rounded-2xl`. Consolidate most normal cards to `rounded-lg` or a token-backed `rounded-[var(--radius-lg)]`.

### 3.3 Shadows

Desktop data apps should be quiet. Prefer borders over shadows.

- Default panel: `border`, no visible shadow or very subtle `shadow-sm`.
- Floating dropdown/dialog: `shadow-lg`.
- Avoid custom shadows like `shadow-[0_1px_3px_rgba(...)]` in page files. Put them behind component variants.
- Avoid hover shadow on every card. Only interactive cards should change on hover.

### 3.4 Spacing

Page and panel spacing should be predictable:

- App shell `main`: owns outer page padding.
- Individual pages should not start with another full `p-6` unless they opt out of shell padding.
- Page vertical rhythm: `space-y-5`.
- Header to first panel: `16px` or `20px`.
- Panel padding: `16px` for dense panels, `20px` for forms.
- Metric card padding: `16px`.
- Table cell padding: `12px 16px`.

### 3.5 Typography

- Page title: `18px`, `font-semibold`, slate-900.
- Page subtitle: `12px`, slate-400/500.
- Section title: `14px`, `font-semibold`, slate-700/800.
- Card metric value: `24px` for dashboard-level metrics, `20px` for secondary metrics.
- Table and controls: `13px` or `14px`.
- Footer/legal text: `11px`.

Do not use `text-2xl` for normal internal pages.

## 4. Component Strategy

Prefer extending the existing local UI layer over replacing the project with a heavy library.

### 4.1 Keep And Improve

Keep:

- `lucide-react` for icons.
- `recharts` for charts.
- `@tanstack/react-table` for complex tables.
- `framer-motion` only where motion adds useful continuity; remove ornamental repeated entrance delays if they make navigation feel busy.
- `sonner` as the single toast system.

Improve:

- `Button`: add more variants and standardize focus.
- `Card`: add variants for `panel`, `metric`, `interactive`, `subtle`, and remove default hover shadow unless requested.
- `Input` and `Select`: support left icons, sizes, invalid state, and consistent focus.
- `Dialog`: migrate to Radix Dialog or tighten current custom implementation for accessibility.

### 4.2 Recommended New Local Components

Create these in `src/components/ui` or `src/components/layout` before page migration:

#### `PageShell`

Purpose: standardize max width, page spacing, and optional full-height layout.

Suggested API:

```tsx
type PageShellProps = {
  children: React.ReactNode;
  width?: "md" | "lg" | "xl" | "full";
  mode?: "document" | "workbench" | "chat";
  className?: string;
};
```

Rules:

- `md`: settings/import/help pages, max width around `672px`.
- `lg`: forms and moderate content, max width around `960px`.
- `xl`: most analytical data pages, max width around `1152px`.
- `full`: pages that need the full workstation area.
- `workbench`: no extra nested `p-6`; uses shell padding and fills height.

#### `PageHeader`

Purpose: standardize page title, subtitle, icon tile, and actions.

Suggested API:

```tsx
type PageHeaderProps = {
  icon?: React.ElementType;
  iconTone?: "primary" | "brand" | "success" | "warning" | "danger" | "ai" | "neutral";
  title: string;
  description?: string;
  actions?: React.ReactNode;
};
```

Rules:

- Always use `h1`.
- Icon tile size: `40px`.
- Title: `text-lg font-semibold`.
- Description: `text-xs text-slate-400`.
- Header actions use `Button`, not raw `button`.

#### `Surface` / `Panel`

Purpose: one wrapper for white bordered UI blocks.

Suggested API:

```tsx
type SurfaceProps = {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
};
```

Use this instead of repeatedly writing:

```tsx
<div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
```

#### `MetricCard`

Purpose: unify dashboard metric cards.

Suggested API:

```tsx
type MetricCardProps = {
  icon?: React.ElementType;
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "neutral" | "primary" | "brand" | "success" | "danger" | "warning" | "ai";
  helper?: React.ReactNode;
};
```

Use for dashboard stats, fire price analysis stats, item stats, arbitrage stats, price analysis stats.

#### `Toolbar`

Purpose: unify filter/search/action bars.

Suggested API:

```tsx
type ToolbarProps = {
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  status?: React.ReactNode;
};
```

Rules:

- Error/debug text does not live inline inside filters. Use `InlineAlert`, toast, or a separate status row.
- On narrower widths, filters wrap before actions.

#### `SegmentedControl`

Purpose: replace custom tab/segmented button clusters.

Suggested API:

```tsx
type SegmentOption<T extends string> = {
  label: string;
  value: T;
  count?: number;
  tone?: "neutral" | "primary" | "success" | "danger" | "warning" | "ai";
};
```

Use for:

- Fire time range buttons.
- Strategy tabs.
- Alert filters.
- Data monitor type/mode selectors.
- Arbitrage result filters.
- Price analysis sort toggles.

#### `StatusBadge`

Purpose: unify all pills/status labels.

Tones:

- `neutral`
- `primary`
- `success`
- `danger`
- `warning`
- `ai`
- `muted`

Use for:

- Network/local data source.
- Notification state.
- Current season.
- Enabled/disabled rules.
- Server connection.
- Normal/expert mode.

#### `EmptyState`

Purpose: unify empty states across dashboard, tables, analysis pages, and config pages.

Suggested API:

```tsx
type EmptyStateProps = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};
```

Rules:

- Icon size: 48 or 56, never random 64 unless page is fully empty.
- Empty state text should be actionable but not instructional clutter.
- Put the empty state inside a `Surface` unless the entire page is intentionally empty.

#### `DataTable`

Purpose: wrap table header/body/empty/loading styles.

Use existing `@tanstack/react-table` where sorting or complex cells exist.

Suggested features:

- `loading`
- `empty`
- consistent `thead`, row hover, sticky header option
- horizontal overflow
- optional compact density

#### `FormField`

Purpose: standardize labels, descriptions, validation, and form control layout.

Use in Settings, Data Monitor, Dialogs, Server Admin, Import/Export.

#### `InlineAlert`

Purpose: show fetch errors, validation warnings, and blocked state inside panels.

Tones:

- `info`
- `warning`
- `danger`
- `success`

Use instead of raw text such as `错误: Cannot read properties...` in toolbars.

## 5. Better Component Recommendations

### 5.1 Do Not Move To Ant Design Or MUI

Do not replace the app with Ant Design, MUI, or a full enterprise UI kit unless the product direction changes. Those libraries would solve consistency, but they will also impose a generic web-admin look and add migration weight.

### 5.2 Add Radix Primitives Selectively

The project already uses `@radix-ui/react-slot`. Add Radix primitives only where they solve accessibility and consistency:

- `@radix-ui/react-dialog`: replace custom dialogs and modal overlays.
- `@radix-ui/react-tabs`: strategy tabs, alert filters if tabs are semantic.
- `@radix-ui/react-select`: better select popovers than native select when styling consistency matters.
- `@radix-ui/react-dropdown-menu`: row actions, group card more menu, section picker.
- `@radix-ui/react-switch`: settings toggles and AI enable toggle.
- `@radix-ui/react-tooltip`: icon-only buttons.
- `@radix-ui/react-scroll-area`: scrollable panels if native scrollbars become visually noisy.

Use a shadcn-like local wrapper pattern, not direct Radix imports in every page.

### 5.3 Add `@tanstack/react-virtual` If Large Tables Lag

For item tables, history lists, and analysis lists, add virtualization only when there are real performance issues. Recommended package:

- `@tanstack/react-virtual`

Do not virtualize short panels or cards prematurely.

### 5.4 Unify Toasts On Sonner

Remove or stop using `src/components/ui/Toast.tsx` after migration. Use `sonner` everywhere because `App.tsx` already mounts `Toaster`.

### 5.5 Keep Recharts, Add A Chart Wrapper

Keep `recharts`. Add local chart wrappers:

- `ChartPanel`
- `ChartLegend`
- `ChartEmptyState`
- shared tooltip style
- shared axis/tick colors

This is enough for the current analytical pages.

### 5.6 Use `cmdk` Only If Global Search Is Added

If the app later adds a command palette or global item search, use `cmdk`. Do not add it only for local table search fields.

## 6. Global Layout Changes

### 6.1 `App.tsx`

Current issue:

- `main` has `px-6 py-5`, and pages often add their own `p-6`.

Target:

- `App.tsx` should own only the app frame.
- `main` should provide a consistent scroll container and baseline background.
- Pages should use `PageShell` for max width and spacing.

Suggested direction:

```tsx
<main className="flex-1 overflow-auto bg-app px-6 py-5">
  <LazyPage>...</LazyPage>
</main>
```

Then each page starts with:

```tsx
<PageShell width="xl">
  <PageHeader ... />
  ...
</PageShell>
```

For full-height pages:

```tsx
<PageShell width="full" mode="workbench">
  ...
</PageShell>
```

### 6.2 Sidebar

Current issue:

- Active state is good but focus outline can conflict with active style.
- Brand icon uses an orange/red gradient while selected nav uses blue; this is acceptable if brand stays limited.
- Bottom small-window icon is hand-written SVG.

Target:

- Use `Monitor` or another Lucide icon for small-window mode.
- Add consistent focus-visible ring.
- Consider grouping nav items into primary, analysis, admin, support sections if navigation grows.
- Keep width at `200px` for now.

Recommended selected style:

- Background: primary soft.
- Text/icon: primary.
- Left indicator: primary.
- No custom orange focus ring.

### 6.3 TopBar

Current issue:

- Top bar is useful but visually dense.
- Status chips are local ad hoc spans.

Target:

- Use `StatusBadge` for network and notification.
- Use `Button` for refresh, with a standard loading icon state.
- Use compact separators between fire price metrics.
- Consider making "current fire price" more prominent only if it is the main global context.

## 7. Page-By-Page Modification Plan

### 7.1 Dashboard / Monitor Home

Files:

- `src/components/dashboard/DashboardContent.tsx`
- `src/components/dashboard/DashboardStats.tsx`
- `src/components/dashboard/SearchBar.tsx`
- `src/components/dashboard/GroupCard.tsx`
- `src/components/dashboard/SortableGroupCard.tsx`
- `src/components/dashboard/AddSectionDialog.tsx`

Current:

- Strongest page visually.
- Uses consistent compact cards, but card and toolbar styles are custom.
- Empty dashboard is functional but sparse.

Changes:

- Wrap page with `PageShell width="xl"`.
- Convert stats to `MetricCard`.
- Convert search/import/export filter row to `Toolbar`.
- Convert add group CTA to a standard dashed `Button` variant or `EmptyAction`.
- Convert group cards to `Surface` plus `DataTable` style table.
- Replace manual input focus styles in editable cells with `Input` or a compact inline edit class.

Acceptance:

- Dashboard has one consistent max width.
- Stats, search toolbar, group cards align exactly.
- Empty state has clear action and no layout jump.

### 7.2 Fire Price Analysis

File:

- `src/components/dashboard/FirePriceComparePage.tsx`

Current:

- Good candidate for the standard page pattern.
- Header, controls, stats, chart are clean but custom.

Changes:

- Use `PageShell width="xl"`.
- Use `PageHeader` with `BarChart2` and brand tone.
- Convert controls panel to `Toolbar`.
- Convert time range buttons to `SegmentedControl`.
- Convert stat cards to `MetricCard`.
- Use `ChartPanel` and shared Recharts styling.
- Replace custom day range inputs with `Input size="sm"` inside `FormField` or compact inline range.

Acceptance:

- Same header structure as Items, Data Monitor, Arbitrage.
- Chart empty/loading states use `EmptyState`.
- No raw repeated card shell classes remain in page JSX except exceptional chart layout.

### 7.3 Items / Price Data

File:

- `src/components/dashboard/ItemsPage.tsx`

Current:

- Header and table are close to target.
- Filter row displays error/debug text inline.
- Native selects and inputs are manually styled.
- Uses local `ToastContainer` while the app already has `sonner`.

Changes:

- Use `PageShell width="xl"`.
- Use `PageHeader`.
- Convert stats to `MetricCard`.
- Convert filters to `Toolbar`.
- Move compare errors to `InlineAlert tone="danger"` below toolbar or to `toast.error`.
- Convert refresh action to `Button`.
- Replace local `ToastContainer` with `sonner`.
- Wrap table in `DataTable`.
- If item count becomes high, add table virtualization as a separate performance PR.

Acceptance:

- No raw `错误: ...` text inside toolbar.
- Table loading and empty rows match the rest of the app.
- Filters wrap cleanly at narrower widths.

### 7.4 Deals / Bargain And Sell

File:

- `src/components/dashboard/DealsPage.tsx`

Current:

- Uses a full-height workbench layout, but its header is a white strip inside the page, unlike most other pages.
- Settings modal is custom and uses `rounded-2xl`.

Changes:

- Use `PageShell width="full" mode="workbench"`.
- Use `PageHeader` with actions.
- Convert summary chips to `StatusBadge`.
- Use `Surface` for the two columns when data exists.
- Use `EmptyState` for no data.
- Replace settings modal with shared `Dialog`, `FormField`, `Button`, and `Input`/range field components.

Acceptance:

- Header aligns with other pages.
- Empty state is centered in a panel, not floating in blank canvas.
- Modal style matches strategy/alert/arbitrage dialogs.

### 7.5 Strategies

File:

- `src/components/dashboard/StrategiesPage.tsx`

Current:

- Lots of repeated local buttons, cards, dialogs, tabs.
- Good candidate for biggest component payoff.

Changes:

- Use `PageShell width="full"` or `width="xl"` depending on list density.
- Use `PageHeader` with `Shield`.
- Replace tab strip with `SegmentedControl` or Radix Tabs wrapper.
- Convert strategy/template cards to `Surface`.
- Convert dialogs to shared `Dialog`.
- Replace raw form controls with `FormField`, `Input`, `Select`, `Button`.
- Standardize badges for label, difficulty, enabled, recommendation score.
- Keep business calculations unchanged.

Acceptance:

- All modal headers, footers, buttons, and fields follow the same dialog layout.
- Strategy cards and template cards share panel styling.
- Tab style matches alert/arbitrage segmented controls.

### 7.6 Alerts

File:

- `src/components/dashboard/AlertsPage.tsx`

Current:

- Similar to Strategies but smaller.
- Amber is used as the page action color. It should be warning tone, not the global primary action, unless the action is explicitly warning-related.

Changes:

- Use `PageShell width="xl"`.
- Use `PageHeader` with `Bell`, warning icon tone.
- Make "New Rule" a primary blue `Button`; warning color remains in icon/badges.
- Replace filter pills with `SegmentedControl`.
- Convert empty state to `EmptyState`.
- Convert rule rows to `Surface`.
- Convert create dialog to shared `Dialog` and `FormField`.

Acceptance:

- Alert page no longer feels like a separate amber-themed app.
- Enabled/disabled states use `StatusBadge`.

### 7.7 Arbitrage

File:

- `src/components/dashboard/ArbitragePage.tsx`

Current:

- Visually richer than other pages.
- Uses green gradient icon and many raw dialog/form controls.

Changes:

- Use `PageShell width="xl"` or `width="full"` if result rows need width.
- Use `PageHeader` with `Calculator`, success tone.
- Convert stats to `MetricCard`.
- Convert result filters to `SegmentedControl`.
- Convert result container to `DataPanel`/`Surface`.
- Convert create/edit ingredient/output dialogs to shared `Dialog` plus `FormField`.
- Use `DropdownMenu` for row actions if Radix is added.

Acceptance:

- Arbitrage page keeps its operational personality but no longer uses a unique component style.
- Dialog forms match Strategies and Alerts.

### 7.8 Price Analysis

File:

- `src/components/dashboard/PriceAnalysisPage.tsx`

Current:

- Similar purpose to Items/FirePrice analysis but looser structure.
- Filter controls use smaller radius and less consistent focus.

Changes:

- Use `PageShell width="xl"`.
- Use `PageHeader`.
- Convert stats to `MetricCard`.
- Put filters/sort controls in `Toolbar`.
- Convert sorting pills to `SegmentedControl`.
- Convert result cards to `Surface` with a shared recommendation badge style.
- Use `EmptyState`.
- Replace `ToastContainer` with `sonner`.

Acceptance:

- Analysis cards scan as a data list, not independent mini cards with unique styling.
- Sort/filter controls match Items page.

### 7.9 AI Analysis

File:

- `src/components/dashboard/AIAnalysisPage.tsx`

Current:

- Chat/workbench page with unique purple styling.
- Needs a different layout, but should still share headers, badges, and buttons.

Changes:

- Use `PageShell width="full" mode="chat"`.
- Use `PageHeader` with `Brain`, AI tone, actions.
- Use `StatusBadge` for OpenClaw and connection state.
- Replace custom toggle with `Switch`.
- Keep chat bubbles, but route colors through semantic tones.
- Use `Button size="icon"` for reconnect and send actions, with tooltips.
- Replace config modal with shared `Dialog`.

Acceptance:

- AI page remains clearly AI-specific but not visually detached from the app.

### 7.10 Data Monitor

File:

- `src/components/dashboard/DataMonitorPage.tsx`
- `src/components/dashboard/ServerAdminPanel.tsx`

Current:

- Good information architecture.
- Many repeated panels, fields, segmented controls, and status badges.

Changes:

- Use `PageShell width="xl"`.
- Use `PageHeader`.
- Convert server connection card to `Surface`.
- Use `FormField` for server URL.
- Use `StatusBadge` for connection and modes.
- Use `SegmentedControl` for data type and server mode.
- Use shared `Select`.
- Convert normal/expert collection status cards to `MetricCard` or `Surface`.
- Use `InlineAlert` for "not connected" guidance.
- Refactor `ServerAdminPanel` to consume shared panels, tabs, and fields.

Acceptance:

- Controls line up and use the same height.
- Connection status is visible but not oversized.
- Admin panel does not introduce a separate amber visual system.

### 7.11 Settings

File:

- `src/components/dashboard/SettingsPage.tsx`

Current:

- Very dense and useful.
- `max-w-2xl` is reasonable.
- Many repeated toggles, fields, and section panels.

Changes:

- Use `PageShell width="md"`.
- Use `PageHeader`.
- Use `Surface` for each settings section.
- Replace custom switch markup with shared `Switch`.
- Use `FormField` for every labeled input/select.
- Use `Button` variants for destructive and secondary actions.
- Use `InlineAlert` for warning and validation states.
- Keep `ConfirmDialog`, but align its style with shared `Dialog`.

Acceptance:

- Section spacing and field labels are consistent.
- Toggle visuals are identical across all settings sections.
- Destructive actions are clearly separated.

### 7.12 Import / Export

File:

- `src/components/dashboard/ImportExportPage.tsx`

Current:

- Good compact page, but adds its own `bg-slate-50` inside the app canvas.

Changes:

- Use `PageShell width="md"`.
- Use `PageHeader`.
- Convert database info to `MetricCard` or `Surface`.
- Use `Surface` sections for import/export.
- Use `Button` variants and `InlineAlert` for import results.
- Remove duplicate page background class.

Acceptance:

- Import/export visually matches Settings and Help.

### 7.13 Help

File:

- `src/components/dashboard/HelpPage.tsx`

Current:

- Uses larger web-document heading scale.

Changes:

- Use `PageShell width="lg"`.
- Use `PageHeader`.
- Convert version info to `InlineAlert tone="info"` or `Surface`.
- Convert FAQ rows to `Surface`.
- Keep content simple.

Acceptance:

- Help looks like an internal app page, not a standalone docs webpage.

## 8. Implementation Phases

### Phase 0: Guardrails

Do before any visual refactor:

- Create or update this document.
- Confirm no unrelated user changes are reverted.
- Run `git status --short` before and after changes.
- Keep each phase in a small, reviewable patch.

### Phase 1: Component Foundation

Add or refactor:

- `PageShell`
- `PageHeader`
- `Surface`
- `MetricCard`
- `Toolbar`
- `SegmentedControl`
- `StatusBadge`
- `EmptyState`
- `InlineAlert`
- `FormField`

Update:

- `Button`
- `Card`
- `Input`
- `Select`
- `Dialog`

Do not migrate all pages in this phase. Add primitives first.

### Phase 2: High-Visibility Pages

Migrate:

1. Dashboard
2. Fire Price Analysis
3. Items
4. Data Monitor

These pages define the visual language for most users.

### Phase 3: Workflow Pages

Migrate:

1. Deals
2. Strategies
3. Alerts
4. Arbitrage

This phase handles dialog and form consistency.

### Phase 4: Secondary Pages

Migrate:

1. Price Analysis
2. AI Analysis
3. Settings
4. Import/Export
5. Help

Settings can be moved earlier if the team prioritizes configuration clarity.

### Phase 5: Cleanup

Remove or reduce:

- Raw page-level `bg-white rounded-* border ...` class repetition.
- `ToastContainer` usage.
- Duplicate custom modal shells.
- Duplicate hand-written switches and segmented controls.
- Debug text in UI.
- Unused CSS component classes in `index.css` if replaced by React primitives.

## 9. AI Agent Execution Instructions

Future AI agents should follow these rules when using this document.

### 9.1 Before Editing

1. Read this document.
2. Run `git status --short`.
3. Inspect the page file and any shared component it uses.
4. Identify whether the current task is foundation, page migration, or cleanup.
5. Do not change Rust/Tauri command behavior for visual-only tasks.
6. Do not rewrite business logic, query keys, mutations, or data calculations unless explicitly requested.

### 9.2 Editing Rules

- Prefer shared components over page-local class strings.
- Keep changes scoped to the current phase/page.
- Do not introduce a new visual style that is not described here.
- Use `lucide-react` icons.
- Use `Button`, `Input`, `Select`, and new UI primitives instead of raw controls.
- If a component needs a new variant, add it to the shared component rather than patching a one-off class into a page.
- Keep Chinese UI copy concise.
- Use `sonner` for toast messages.
- Avoid nested cards. A section can contain repeated cards, but do not put decorative cards inside decorative cards.
- Use component props for tone, size, and state instead of hard-coded colors where practical.

### 9.3 Verification

After each page migration:

1. Run `npm run typecheck`.
2. Run `npm run vite:dev`.
3. Open `http://localhost:5173/`.
4. Visually check desktop viewport around `1280x720`.
5. Check at least one narrower viewport around `900x700` if the page has filters/tables.
6. Confirm there is no horizontal overflow except intentional table scrolling.
7. Confirm text does not overlap buttons or badges.
8. Confirm loading, empty, and error states still render.

If browser-only Vite cannot call Tauri commands, this is acceptable for visual verification. Do not treat missing Tauri invoke as a business logic regression unless the Tauri app itself is being tested.

### 9.4 Acceptance Checklist

A migrated page is done when:

- It uses `PageShell`.
- It uses `PageHeader`.
- Primary actions use `Button`.
- Status labels use `StatusBadge`.
- Empty states use `EmptyState`.
- Filter/action rows use `Toolbar` or `SegmentedControl`.
- Tables use `DataTable` or the shared table classes.
- Dialogs use the shared dialog pattern.
- No debug text appears in the normal UI.
- Colors follow the semantic rules in this document.
- Typecheck passes.

## 10. Class Replacement Guide

Use this guide for mechanical refactors.

### 10.1 Page Wrappers

Replace:

```tsx
<div className="p-6 space-y-6 max-w-6xl mx-auto">
```

With:

```tsx
<PageShell width="xl">
```

Replace:

```tsx
<div className="h-full flex flex-col overflow-hidden">
```

With:

```tsx
<PageShell width="full" mode="workbench">
```

### 10.2 Headers

Replace page-local header blocks with:

```tsx
<PageHeader
  icon={Database}
  iconTone="primary"
  title="物价数据"
  description="查看和管理游戏物品价格信息"
  actions={<Button>获取物品信息</Button>}
/>
```

### 10.3 Cards

Replace:

```tsx
<div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
```

With:

```tsx
<Surface padding="md">
```

### 10.4 Metric Cards

Replace page-local stat cards with `MetricCard`.

### 10.5 Raw Buttons

Replace:

```tsx
<button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg ...">
```

With:

```tsx
<Button>
  <RefreshCw className="w-4 h-4" />
  获取物品信息
</Button>
```

### 10.6 Filter Pills

Replace clusters of small conditional buttons with `SegmentedControl`.

### 10.7 Error Text

Replace:

```tsx
<div className="text-xs text-slate-500">错误: ...</div>
```

With:

```tsx
<InlineAlert tone="danger">...</InlineAlert>
```

or a `toast.error(...)` if the message is transient.

## 11. Component Backlog

Priority order:

1. `PageShell`
2. `PageHeader`
3. `Surface`
4. `MetricCard`
5. `StatusBadge`
6. `EmptyState`
7. `Toolbar`
8. `SegmentedControl`
9. `InlineAlert`
10. `FormField`
11. `DataTable`
12. `Switch`
13. `Tooltip`
14. `DropdownMenu`

Optional external dependencies:

- Add Radix Dialog/Switch/Tabs/Dropdown/Tooltip when accessibility or behavior is needed.
- Add `@tanstack/react-virtual` only after confirming large-list performance issues.
- Add `cmdk` only for a global command palette.

## 12. Risks And Mitigations

Risk: visual refactor accidentally changes behavior.  
Mitigation: keep query logic and command calls untouched; only move JSX and classes.

Risk: one large patch becomes unreviewable.  
Mitigation: migrate one page or one component family per patch.

Risk: new components become too generic.  
Mitigation: design APIs around current app patterns, not theoretical future needs.

Risk: external UI dependency adds inconsistent styles.  
Mitigation: wrap external primitives in local components and expose only local APIs.

Risk: Vite browser mode shows Tauri invoke errors.  
Mitigation: use browser mode for visual layout only; test Tauri-specific behavior separately.

## 13. Definition Of Done For The Whole UI Pass

The UI unification project is complete when:

- All dashboard pages use the shared page/header/surface primitives.
- Buttons, inputs, selects, switches, dialogs, badges, tabs, empty states, and alerts have one visual language.
- The app uses `sonner` only for toasts.
- Manual raw style strings are reduced to layout-specific exceptions.
- No page has a unique color theme unless it is semantically justified.
- Desktop `1280x720` screenshots of all pages look like one product.
- `npm run typecheck` passes.

