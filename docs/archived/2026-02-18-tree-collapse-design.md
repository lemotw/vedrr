# Tree Collapse Design

## Summary
Add collapse/expand to tree nodes. Frontend-only state (not persisted to DB).

## State
- `uiStore.collapsedNodes: Set<string>` + `toggleCollapse(nodeId)`

## Triggers
- `z` key: toggle selected node (must have children)
- Right-click ContextMenu: "Collapse" / "Expand" item

## Visual: Collapsed Dots
- Hide child subtree, show colored dots (one per direct child)
- Dot color = child's node_type color
- Connector line shortened to dot position
- Click dots area = expand

## Navigation
- `l/->` on collapsed node = expand (don't enter)
- `j/k` skip collapsed subtree nodes
- `h/<-` normal

## Files
- `uiStore.ts`: collapsedNodes + toggleCollapse
- `TreeCanvas.tsx`: collapsed rendering + dot indicators
- `useKeyboard.ts`: z key + navigation adjustments
- `ContextMenu.tsx`: Collapse/Expand menu item
