# Mind Flow — Design Execution Plan

> Date: 2025-02-14
> Reference: PRD v1.0, design/design.pen (6 screens)

---

## 1. Design System Summary

### 1.1 Established Tokens (from design.pen)

**Colors:**

| Token | Value | Usage |
|-------|-------|-------|
| `$bg-page` | #1A1A1A | Main background |
| `$bg-card` | #212121 | Card/container surfaces |
| `$bg-elevated` | #2D2D2D | Elevated elements (badge, chip, input) |
| `$accent-primary` | #FF6B35 | Active state, CTA buttons |
| `$accent-success` | #00D4AA | Success, [M] node color |
| `$text-primary` | #FFFFFF | Primary text |
| `$text-secondary` | #777777 | Secondary/muted text |

**Node Type Colors:**

| Type | Color | Usage |
|------|-------|-------|
| [T] Text | #4FC3F7 | Light blue |
| [M] Markdown | #00D4AA | Green (= accent-success) |
| [I] Image | #FFD54F | Yellow/amber |
| [F] File | #CE93D8 | Purple |

**Typography:**

| Role | Font | Weight |
|------|------|--------|
| Heading | Oswald | 700 |
| Body / UI | JetBrains Mono | 400, 700 |

**Spacing:**

| Token | Value |
|-------|-------|
| Card padding | [8, 12] |
| Card gap | 8 |
| Card cornerRadius | 6 |
| Badge size | 20x20 |
| Badge cornerRadius | 4 |
| Section cornerRadius | 8 |
| Tree children gap | 14 |
| H-line (child) | 20px |
| H-line (root) | 40px |
| H-line (outgoing) | 30px |
| V-bar wrapper padding | [18, 0] |

---

## 2. Screens Designed (6 total)

| Screen | ID | Size | Status |
|--------|----|------|--------|
| Focus Mode | `comiU` | 1440x900 | Complete |
| Quick Switcher | `7i1hb` | 480x520 | Complete |
| Context Manager | `aHNEx` | 900x900 | Complete |
| Node Popover | `JLrIJ` | 1440x900 | Complete |
| Markdown Editor | `p5XaP` | 1440x900 | Complete |
| Wide Tree | `Azwo5` | 1800x2900 | Complete |

---

## 3. Remaining Design Tasks

### 3.1 Interaction Specifications

以下互動細節尚未在 design.pen 中完整定義，需補充：

**Focus Mode Tree Interactions:**
- [ ] Node hover state（哪些視覺變化）
- [ ] Node selected state（邊框？背景色？）
- [ ] Node editing state（inline edit 的 cursor、input 邊框）
- [ ] Drag & drop 視覺回饋（ghost node、drop target indicator）
- [ ] Collapse/expand animation（或者用 icon 表示？）
- [ ] Tree zoom/pan behavior（scroll? trackpad pinch?）

**Quick Switcher Interactions:**
- [ ] Keyboard selected item highlight style
- [ ] Search result highlight（matched chars）
- [ ] Empty state（no results）
- [ ] 打開/關閉的 transition animation

**Context Manager Interactions:**
- [ ] Right-click context menu 的樣式
- [ ] Tag chips 的 active/inactive style
- [ ] Graph view 的 node hover / click / drag
- [ ] Section collapse/expand

**Node Popover:**
- [ ] Popover 出現的 position logic（避免超出 viewport）
- [ ] Type selector hover state
- [ ] Rename input focus state

**Markdown Editor:**
- [ ] Toolbar button hover/active states
- [ ] Resize handle for tree panel width
- [ ] Unsaved changes indicator

### 3.2 New Screens/States to Design

- [ ] **Empty State — No Contexts**: 第一次打開 app，沒有任何 context
- [ ] **Empty State — Empty Tree**: context 剛建立，tree 是空的
- [ ] **Idle Context Visual**: active context 超過 1h 未操作的灰色效果
- [ ] **Delete Confirmation**: 刪除 context/node 的確認 dialog
- [ ] **Onboarding / Welcome**: 首次使用的引導（optional for MVP）
- [ ] **Loading State**: tree 載入中的 skeleton/spinner

### 3.3 Component Library Spec

需要從 6 個 screens 中提取可複用的 component library：

**Atomic Components:**
- [ ] `IconBadge` — 20x20 type badge（4 colors x 4 letters）
- [ ] `Chip` — tag chip (e.g., #work, #study)
- [ ] `Divider` — 1px horizontal line (#444444)
- [ ] `SearchInput` — search bar（bg-card, placeholder text）
- [ ] `Button` — primary ($accent-primary) / ghost ($bg-elevated)
- [ ] `SectionHeader` — uppercase label (10px, weight 700, letter-spacing 2)

**Compound Components:**
- [ ] `NodeCard` — icon badge + label (horizontal)
- [ ] `NodeImageCard` — icon badge + label + thumbnail (vertical)
- [ ] `ContextRow` — indicator + name + tag + time + count
- [ ] `StatusBar` — left info + right action
- [ ] `TreeConnector` — h-line + v-bar + wrapper

**Layout Components:**
- [ ] `Modal` — centered overlay (Quick Switcher)
- [ ] `Panel` — full-screen overlay (Context Manager)
- [ ] `SplitPane` — resizable 2-column (Markdown Editor)
- [ ] `Popover` — floating card near target

### 3.4 Responsive / Window Resize

PRD 目標是桌面，但需要定義最小視窗尺寸行為：

- [ ] 定義最小視窗寬度（e.g., 800px）
- [ ] Tree area 在窄視窗的行為（水平 scroll? 縮放?）
- [ ] Quick Switcher 在小視窗的位置
- [ ] Context Manager 在小視窗的 layout

### 3.5 Accessibility

- [ ] 所有互動元素的 focus ring style
- [ ] Color contrast ratio 驗證（text on backgrounds）
- [ ] Screen reader label conventions
- [ ] Reduced motion preference support

---

## 4. Design Deliverables Checklist

### Phase 1: Core Interaction (align with Frontend M1-M2)
- [ ] Node states spec (hover, selected, editing, dragging)
- [ ] Tree interaction spec (collapse, expand, navigate)
- [ ] IconBadge / NodeCard / NodeImageCard component spec
- [ ] TreeConnector component spec
- [ ] Empty states (no context, empty tree)

### Phase 2: Overlays (align with Frontend M3-M4)
- [ ] Quick Switcher interaction states
- [ ] Quick Switcher transition animation
- [ ] Node Popover positioning spec
- [ ] Markdown Editor toolbar states
- [ ] Delete confirmation dialog
- [ ] Context menu (right-click) style

### Phase 3: Management (align with Frontend M5)
- [ ] Context Manager interaction states
- [ ] Tag chip style spec
- [ ] Graph view interaction spec (CK)
- [ ] Insights bar data display

### Phase 4: Polish (align with Frontend M6)
- [ ] Drag & drop visual feedback spec
- [ ] Idle context gray effect
- [ ] Loading / skeleton states
- [ ] Transition animations catalog
- [ ] Accessibility audit
- [ ] Window resize behavior

---

## 5. Design-to-Code Handoff Notes

### Token Mapping

design.pen 的 variables 直接對應 CSS custom properties：
- `$bg-page` → `var(--bg-page)`
- `$bg-card` → `var(--bg-card)`
- 以此類推

### Component Structure

design.pen 中的 frame 結構反映 React component hierarchy：
- `Focus Mode / StatusBar` → `<StatusBar />`
- `Focus Mode / TreeWrap / xmTree` → `<TreeCanvas />`
- `Quick Switcher` → `<QuickSwitcher />`
- `Context Manager / cmBody / activeSec` → `<ContextSection state="active" />`

### Spacing Rules

從 design 提取的間距規則：
- Card 內 padding 統一 `[8, 12]`（上下 8, 左右 12）
- Section 內 padding 統一 `[12, 16]`
- 全局 tree area padding `[32, 40]`（上下 32, 左右 40）
- Quick Switcher row padding `[10, 16]`

### Font Usage

- **Oswald 700**: Context name (root node heading), Context Manager title
- **JetBrains Mono 400**: Body text, node labels, secondary info
- **JetBrains Mono 700**: Section headers, icon badge letters, status counts
- **JetBrains Mono 10px**: Section labels (ACTIVE, ARCHIVED), badges (⌘K)
- **JetBrains Mono 13px**: Standard UI text, node labels
- **JetBrains Mono 14px**: Status bar info
- **Oswald 28px**: Root node title (tree heading)
