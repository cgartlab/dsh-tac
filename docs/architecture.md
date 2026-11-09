# Architecture

`dsh-tac` is a DSH **client bundle**: `package.json` points at
`cordis.patch.yml`, which inserts the package into the harness profile. The host half
(`index.js`) is intentionally a no-op; everything runs in the browser client through the
harness client module loader.

The plugin is written in TypeScript under `src/`; `client.js` and `index.js` are generated
by `scripts/build.mjs` (esbuild) and must not be edited by hand.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | loader entry: binds the host React, calls `apply` |
| `src/apply.ts` | dictionaries, styles, stores, native board/sidebar actions, slot wiring |
| `src/runtime.ts` | the host React binding (`h`, hooks) — the bundle never imports React |
| `src/host.ts` | typed host contract (`HostContext` and the services it exposes) |
| `src/constants.ts` | plugin id, storage keys, default settings |
| `src/types.ts` | domain types (settings, log entries, stores) |
| `src/core/` | settings + migration, logging, combos, stores, host DOM probes (`dom.ts`), host snapshot shapes (`snapshot.ts`), schedule/preset sources, GitHub data source, palette settings catalog (`settings-catalog.ts`) |
| `src/i18n/` | zh/en dictionaries; `en` is typed against `zh` so parity is a compile error |
| `src/styles.ts` | every CSS rule, injected once into a `<style>` tag |
| `src/ui/` | icon geometry/components, project appearance helpers |
| `src/features/` | board, HUD, palette + shortcut dispatcher, notifications, dialogs, settings page, chat scrolling |

## Entry points

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-tac',
  factory(require) { /* ... */ }
});
```

The factory returns `{ inject, apply }`. `inject` lists the client services the plugin
needs (`slots`, `locale`, `uiWorkspace`, `remote`, `remote.session`, `remote.schedule`,
`remote.agentPresets`, `sidebarRight`, `sidebarRightTabs`, `layout`); `apply(ctx)` wires
dictionaries, styles and slot registrations.

## Slots used

| Slot | Purpose |
| --- | --- |
| `sidebar.panellist` | board icon in the native right-sidebar tab strip |
| `sidebar.right.pane.tab` | full board pane inside the right sidebar |
| `main` | standalone board page (`project-board`) |
| `conversation.header.leading` | session search / history controls / status capsule |
| `conversation.session.header.utilities` | board shortcut buttons next to the session header |
| `conversation.composer.dock` | shortcut hint bar and composer-side buttons |
| `shell.overlay` | palette, rename dialog, session actions, HUD, toasts, notification dock |
| `settings.section` | registers the plugin's 项目看板设置 page; its public ledger also feeds the palette's host-settings index |
| `sidebar.settings` | read-only: its published shell store opens Settings at a section (`openSection`) |

## State

- Settings: a small observable store persisted to `localStorage` under a namespaced key,
  merged with `DEFAULT_SETTINGS` on load.
- HUD state: collapse flag, saved position and per-session timers in `localStorage`.
- Appearance: per-workspace color/icon overrides in `localStorage`.
- Everything else is derived from live client services: `useSessions`,
  `useSessionStatus`, `useWorkspaces`, `useSettings`, the schedule projection and the
  focus store.

No session IDs are created or mutated. The plugin never writes to the session store; it
only reads status and toggles native sidebar presentation.

## Board pane state

DSH's right sidebar stores its open/closed state per session. The board is meant to be a
workspace-level tool, so `BoardSessionGuard` (a `shell.overlay` watcher) remembers the pane
state before a switch and restores it after the new session's state lands. The remembered
state includes the presentation — narrow, half width or fullscreen — not just visibility.
An explicit board shortcut within a second of the switch marks intent, and the guard then
leaves the pane alone.

## Keyboard handling

A single capture-phase `keydown` listener on `document` resolves the configured combo for
each action (see `DEFAULT_SETTINGS.shortcuts`). It is registered on mount and gated on:

- IME composition and key auto-repeat;
- an open dialog (`aria-modal="true"` present);
- an open command palette.

While the palette is open its own keys keep working (`Alt+K` closes it, `Alt+I` / `Alt+,` move
the selection, `Enter` opens, `Esc` closes); the layout and dialog shortcuts — rename, session
menu, board (`Alt+N` / `Alt+B` / `Alt+V`) and the left sidebar (`Alt+W`) — dismiss the palette
first and then act once; every other combo (HUD, interject, hold-scroll, scroll-to-bottom, the
session cycle) is consumed and ignored without touching its feature, so no macOS Option
character leaks into the page. A host dialog (any `aria-modal` element that is not
the palette) blocks every shortcut *without* consuming it, leaving the key to the dialog. The
narrow-window sidebar drawer (`data-shortcut-modal="sidebar"`) is exempt from that block: DSH
keeps its own toggle alive in that state, so `Alt+W` must be able to close the drawer it opens.

One physical press acts once. Actions with a global side effect — the HUD toggle window event,
a hold-scroll loop, a steer click, focus/scroll-to-bottom, opening a session from the cycle —
claim the event with `pbxShortcutActed`. The board and sidebar keep their own
`pbxBoardActed` / `pbxSidebarActed` markers because their log lines separate the two cases.
A leaked listener from a hot reload therefore acts at most once per press; the palette, rename
and session-menu stores are per plugin instance, so a stale listener toggles its own unmounted
store and those actions are deliberately *not* claimed.

Hold-to-scroll (`Alt+U` / `Alt+M`) starts a `requestAnimationFrame` loop that resolves the
live chat scroller each frame, prefetches older history when approaching the top, and
falls back to anchor scrolling when a position write is reverted by the chat view. It
sends one synthetic wheel signal before the first write because DSH can hold a preserved
scroll anchor that would otherwise pull the view back every frame, and holding down to the
bottom focuses the composer.

### Settings that own a shortcut path

Every setting that can make a shortcut *look broken* is checked in one place. The rule is
"the setting gates the path": when the feature is off, the combo is either left to the rest of
the app or turned into a clean no-op — never a half-working surface.

| Setting | Who honours it | Behaviour when off |
| --- | --- | --- |
| `palette.enabled` | dispatcher, before the palette branch | `Alt+K` is not consumed (the key is left to the app) |
| `board.enabled` | dispatcher, before the board branch | `Alt+N` / `Alt+B` / `Alt+V` are not consumed; the capsule entry is hidden too |
| `chat.autoHistory` | passive `installChatHistoryAutoLoad` **and** the hold loop's `requestOlder` (one getter injected from `apply`) | a held `Alt+U` stops at the boundary instead of clicking «load earlier»; a single tap still loads one page, because that is an explicit press |
| `palette.includeArchived` | palette row builder | archived sessions disappear from the list reachable from `Alt+K` |
| `hud.enabled` | HUD toggle handler — deliberately the opposite direction | `Alt+E` turns the list back **on** (there is no other affordance once it is hidden); this is the one switch a shortcut is allowed to flip |

Two of these were real bugs found by asserting the table rather than reading it: `board.enabled`
and `chat.autoHistory` only gated the passive/UI paths and not the shortcut path.

### macOS labels and top clearance

`IS_MAC` in `src/core/combos.ts` reads `navigator.userAgentData.platform` /
`navigator.platform` (UA is only a fallback) and drives `MODIFIER_LABELS`: `⌥`/`⌃`/`⇧`/`⌘`
on macOS, `Alt`/`Ctrl`/`Shift`/`Meta` elsewhere. `comboDisplay` sorts modifiers into the
host's canonical order (control → alt → shift → meta) before labelling, so a chord recorded
in any order renders consistently. **Stored combos stay platform-neutral** — the physical
Option key reports `altKey`, and DSH's built-in shortcut catalog uses `alt`; renaming them
would break saved settings and conflict detection.

`apply()` sets `data-pbx-platform` on `<html>` because Electron injects `data-platform` only
into the native window. `src/styles.ts` uses it to place fixed UI below the macOS menu bar /
window-control strip, following DSH's `--dsh-frame-top-clearance` (48px on macOS, plus 20px;
20px in fullscreen, where the host sets `data-fullscreen`). Toasts, the search palette and
the rename dialog follow the clearance fully; the floating HUD keeps its 120px design
position and only follows a larger clearance, so the layout does not jump.

## Settings search in the command palette

The command palette (`Alt+K`) still defaults to sessions, but typing now also searches
settings. Three result groups share one list, in this order: **Settings** (host-owned
sections), **Project Board settings** (the plugin's own six sections), **Sessions** (the
original rows). Group headers (`palette.group.*`) and a distinct row icon (`sliders` for
host, `board` for plugin) keep settings apart from sessions; all colours come from
`--dsw-alias-*` tokens (`.pbx-paletteGroup`, `.pbx-paletteGroupLabel`,
`.pbx-prowSettingIcon[data-origin]`, `.pbx-setSection.pbx-setHighlight`).

### Where the index comes from

`src/core/settings-catalog.ts` builds a `SettingsCatalogSnapshot` (`host` + `plugin`
entries) kept in a `createUiStore` in `apply.ts`. Host entries are **enumerated, not
hard-coded**: `ctx.slots.entries('settings.section')` returns the public slot ledger's
registration options, from which we read `id` / `order` / `label` (a locale-following thunk
or a string). `apply.ts` subscribes with
`ctx.slots.subscribe('settings.section', refresh)`, so a section contributed later by the
host or another plugin appears in search **without a dsh-tac release**. The plugin's own
section id (`project-board-settings`) is excluded from the host group; its six sub-sections
are a small static index (`PLUGIN_DEFS`) because they all live inside that one page —
Shortcuts / Top function buttons / Interface and behavior / GitHub data source / Logs &
diagnostics / Data — each with an `anchor` and zh+en `keywords`. Keywords are internal index
data and never rendered. Only public surfaces are read: no host-internal shape is assumed,
and the probe is `try/catch`-guarded and falls back to an empty list.

### Opening and locating a section

Choosing a setting calls `chooseSetting` (`apply.ts`) → `openSettingsTarget`, and in the
same step writes `settingsTargetStore`. The open path is a four-level degradation chain,
each step probed before use:

1. `sidebar.settings` publishes its shell store; `store.create().actions.openSection(id)`
   opens Settings **and** selects the section (`section`).
2. `actions.open()` still opens Settings, without selecting a section (`settings`).
3. `clickHostSettingsTrigger()` (`core/dom.ts`) clicks the host's own sidebar Settings
   control, matched by `button[aria-haspopup="dialog"]` plus its accessible name rather
   than hashed CSS classes (`dom`).
4. All three fail → `failed`, a **warn** toast `toast.settingsOpenFailed` ("use the
   sidebar"). The two middle results (`settings` / `dom`) are **partial successes** —
   Settings is open but no section was preselected — and raise an **info** toast
   `toast.settingsOpenPartial` ("Settings opened, but the section could not be selected
   automatically"). `section` is the only result with no toast, so a degraded open is never
   silent.

The result is logged (`settings` / `open-from-palette`) so a degraded path is visible in
Logs & diagnostics. For plugin entries, `settingsTargetStore` also drives the settings
page: it matches the localized `.pbx-setSectionTitle` text, scrolls that `.pbx-setSection`
into view and adds `.pbx-setHighlight` for 2.2 s. Host entries carry no anchor, so they stop
at the selected host section.

### Rendering and one shared keyboard index

`PaletteItem` is a union of `session` and `setting`, flattened into a single `items[]`
array (host settings → plugin settings → sessions). One `index` covers the whole array, so
`↑` / `↓` / `Enter` (and `Alt+I` / `Alt+,` through `state.move`) cross group boundaries
continuously and clamp to `items.length - 1`; there is no per-group cursor. Group headers
are inserted lazily whenever `groupLabel(item)` changes, so they are not part of the index.
`scrollIntoView({ block: 'nearest' })` follows `.pbx-prow` by index, and `setIndex(0)` runs
on every query or scope change.

### Why settings are hidden on an empty query

`matchesSetting` returns false when `q` is empty. Opening `Alt+K` with no query is the
familiar session switcher; settings are a search-driven discovery, and the host section
list is open-ended. Showing them by default would push sessions down and change a
muscle-memory view for which the reader typed nothing. Typing a keyword is what opts into
settings results.

### Why project scope applies to sessions only

`scope` is the project chip filter and is applied only to `visibleSessions`
(`row.projectId === scope`). Settings are global — host sections and the plugin's single
settings page have no project dimension — so filtering them by a project would silently
hide every setting. The chips therefore leave both settings groups untouched.

## Notifications

A `shell.overlay` watcher diffs session status maps between renders:

- `pendingInteraction` appearing (question, plan review, approval) → question/permission
  notification with the full question text and all options;
- `running` true → false without a pending interaction → completion notification.

When the document is focused and visible the watcher pushes an in-app card (bottom-right of
the conversation area) and plays a WebAudio chime; otherwise it uses the system
`Notification` API, falling back to the in-app card when unavailable.

## Checks

- `scripts/check-bundle.cjs` — manifest, exports and syntax.
- `scripts/check-i18n.cjs` — dictionary parity for direct and indirect keys.
- `test/load.test.cjs` — evaluates `client.js` with stubbed DOM/React/host services,
  asserts `apply()` mounts every slot and that both dictionaries match.

## Diagnosing the left-sidebar shortcut

`Alt+W` touches three subsystems, and each one writes its own scope into the in-app log
(Settings → 项目看板日志), so a press that misbehaves can be read back instead of guessed:

| scope | line | meaning |
| --- | --- | --- |
| `shortcut` | `leftSidebar:key` | the key reached the plugin (absent: focus sat in a webview/IME/native menu) |
| `shortcut` | `leftSidebar:blocked` | a real modal dialog owned the keystroke |
| `shortcut` | `leftSidebar:duplicate` | a leaked listener from a hot reload already handled this press |
| `shortcut` | `leftSidebar:acted` | the action ran; `acted:false` means the handler was not wired |
| `shortcut` | `rename:blocked` / `sessionMenu:blocked` | debug level: the combo matched but there was no current session (`target:false`) or a modal owned the press (`dialog:true`) |
| `shortcut` | `hold:no-chat` / `scrollBottom:no-chat` / `userJump:no-target` | debug level: the combo matched but there was no chat scroller, no history target, or nothing to scroll to |
| `sidebar` | `toggle` | which layout API answered (`layout.toggleSidebar` and friends) |
| `sidebar` | `applied` / `no-change` | the frame's grid track and collapsed flag moved, or did not |
| `sidebar` | `leave-fullscreen` | a fullscreen right panel was dismissed first, so the sidebar is visible |
| `hud` | `dock` / `restore` | the floating list tucked into a pill, or came back |

The frame itself is the source of truth for "is the sidebar open": DSH renders it with an
inline `grid-template-columns` whose first track is the sidebar column (0 closed, ~52 rail,
280 expanded) and a `data-sidebar-collapsed` attribute. Those describe the target state and
change on the same frame as the key press, unlike the column's animated width.

Docking keeps the pill's own vertical spot and slides it to the sidebar column's right edge
(`edge + 8`), and remembers the spot to restore it. That reposition only applies to a list the
user has moved: a list still at its configured default anchor (`top-right` / `bottom-right`)
keeps its CSS anchor and is merely collapsed, because sliding a default-anchored pill across
the screen and back would be pure noise. `readExpanded()` prefers the frame's target grid
template, so tests must put a value (not the whole `grid-template-columns: …` declaration) in
`element.style.gridTemplateColumns` or they exercise the measured-width fallback instead.

