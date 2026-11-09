# dsh-tac

[![check](https://github.com/cgartlab/dsh-tac/actions/workflows/check.yml/badge.svg)](https://github.com/cgartlab/dsh-tac/actions/workflows/check.yml)
[![license: CC BY-NC-SA 4.0](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

English | [中文](README.zh.md)

A [DeepSeek Harness](https://deepseek.com) client plugin that turns the harness into a
project-aware workspace: a global project/session board in the native right sidebar, a
floating session HUD, keyboard-first session navigation, hold-to-scroll conversation
reading, and desktop-class task notifications.

## Features

- **Project board** — session and project database views with search, status/type/project
  filters, grouping, multi-column sorting, archive-aware rows, and per-project color and
  icon. The project view has 6 attribute columns (session count / Open Issue / Open PR /
  local version / latest release / last activity). **Click a project row to expand its
  session list inline below** (accordion-style, no page flip). Opens at narrow (380 px),
  medium (50 vw) or native fullscreen; the same key closes it.
  The pane's open state and size belong to the workspace, not to each conversation:
  switching sessions only switches the conversation and never re-opens, closes or resizes
  the board.
- **Floating session HUD** — live active/recent sessions with timers, attention badges,
  automation markers, drag-to-move, and an animated pill ⇄ list collapse; while the native
  left sidebar is open the list collapses to a pill that sits just right of that sidebar and
  returns when it closes (a list you dragged keeps its own vertical spot; one still at its
  default anchor only collapses, it does not jump across the screen). One stable order:
  active sessions first, most recent activity first within a group; switching sessions
  highlights the new row without reshuffling the list, and `⌥+I` / `⌥+,` cycle in
  exactly that order.
- **Command palette** (`⌥+K`) — fuzzy search over sessions and projects, and now over
  settings too (the input prompts for "sessions, projects or settings"). With a keyword,
  results are split into three labelled groups: **Settings** (the host's own settings
  sections, discovered live), **Project Board settings** (the six sections of this plugin's
  settings page — Shortcuts, Top function buttons, Interface and behavior, GitHub data
  source, Logs & diagnostics, Data) and **Sessions** (the original results). Setting rows
  carry their own icon and group headers, and `⌥+I` / `⌥+,` / `↑` / `↓` move continuously
  across all groups; `Enter` opens the session or jumps to the setting. An empty query still
  shows only the familiar session list, and the project filter chips narrow sessions only —
  settings are global. Selecting a setting opens the host Settings page at that section;
  plugin settings also scroll to their section and briefly highlight it. If Settings opens
  but the section cannot be preselected, an info toast says so; if it cannot be opened at
  all, a warn toast points you to the sidebar — a partial success is never silent. Sections
  the host or other plugins add later appear in search without a plugin update.
- **Hold-to-scroll reading** — the conversation scrolls smoothly while the key is held,
  loads older history automatically before reaching the boundary (when "history on scroll"
  is enabled), and falls back to anchor stepping if the chat view reverts a position write.
  Holding `⌥+M` down to the end activates the composer so a reply can be typed immediately.
- **History on scroll** — scrolling a long conversation to the top loads the previous page
  of older messages without clicking "Load earlier" every time. On by default, switchable
  off in settings. It drives the host's own pager, so its loading and error feedback and its
  scroll-position anchoring behave exactly as they do for a manual click.
- **Task notifications** — a session finishing a turn, waiting for an answer, or asking
  for permission raises an in-app card at the bottom-right of the conversation with a
  chime; when the app is in the background a system notification carries the full question
  text and every option.
- **Conflict-aware shortcuts** — recording a combination already used by this plugin or by
  a built-in DSH command is rejected inline, and saved conflicts are reported at startup.
- **Logs & diagnostics** — optional local logs (error / warn / info / debug) with a bounded ring buffer, copy and clear actions in settings, startup checks for shortcut collisions with built-in commands, and captured window errors and rejected promises.
- **Archive from the HUD** — hovering a session row swaps its timer for an archive button; the search palette can include archived sessions (marked "Archived"), controlled by a setting that is on by default.
- **GitHub data source** — map each project to its GitHub repo (owner/repo) and a local version in **Settings → GitHub 数据源**; the board's Open Issue / Open PR / latest-release columns then show live numbers read straight from api.github.com (a Personal Access Token is optional for public repos). Unmapped projects keep a "—" placeholder.

## Keyboard shortcuts

Every shortcut is configurable in **Settings → 项目看板设置**. Defaults:

On macOS these use `⌥` (Option), `⌃` (Control), `⇧` (Shift) and `⌘` (Command); `⌥` is the
physical Option key. On Windows and Linux the same combinations are shown as `Alt+…` /
`Meta+…`. Stored bindings stay platform-neutral, so saved shortcuts need no migration.

| Shortcut | Action |
| --- | --- |
| `⌥+K` | Open / close the command palette (sessions, projects and settings) — inside, `⌥+I` / `⌥+,` / `↑` / `↓` move the selection across all groups, `Enter` opens the session or jumps to the setting |
| `⌥+I` / `⌥+,` | Previous / next session |
| `⌥+U` / `⌥+M` | Previous / next user instruction (tap to jump, hold to scroll) |
| `⌥+S` | Scroll to bottom and focus the composer |
| `⌥+D` | Session actions dialog (archive; delete where the host exposes it) |
| `⌥+N` / `⌥+B` / `⌥+V` | Board at narrow / medium / fullscreen; same key closes |
| `⌥+W` | Show / hide the native left sidebar; leaves a fullscreen board first |
| `⌥+R` | Rename the current session |
| `⌥+E` | Collapse / expand the floating session list |
| `⌥+Enter` | Steer the earliest queued message into the running turn |

## Requirements

- A DeepSeek Harness build with client plugin support and the client packages
  `dsh-client-ui-sidebar`, `dsh-client-ui-workspace`, and `dsh-client-ui-session`.
- Node.js 18+ only for repository checks; the plugin itself is loaded by the harness.

## Install

The bundle is installed as a local link, not from npm:

```powershell
plugin_manager install_bundle target="<this repository>"
```

The package is `@local/dsh-tac` and inserts itself as the `dsh-tac` loader entry.
`package.json` exposes `dsh.bundle.patch` and `dsh.client`; the plugin injects into
`conversation.header.leading`, `conversation.session.header.utilities`,
`conversation.composer.dock`, `shell.overlay`, and `settings.section`.

## How it is built

The plugin is written in **TypeScript** under `src/` and compiled into a single client bundle
(`client.js`) by esbuild. The bundle is loaded through the harness client module loader, uses
only public client services (`ctx.slots`, `ctx.sidebarRight`, `ctx.layout`,
`ctx.get('workspaces')`, session status stores) and takes React from the host. It ships with no
runtime dependencies of its own; host-half `index.js` is intentionally a no-op.

- `src/index.ts` — entry the harness injects; binds the host React and calls `apply`
- `src/apply.ts` — dictionaries, styles, stores, native board/sidebar actions, slot wiring
- `src/features/` — board, floating list, palette + shortcut dispatcher, notifications, dialogs, settings page, chat scrolling
- `src/core/` — settings/migration, logging, combos, stores, DOM probes, schedule + preset sources, palette settings catalog
- `src/i18n/` — zh/en dictionaries (key parity is a compile-time error)
- `client.js`, `index.js` — generated artifacts (never edit by hand)
- `cordis.patch.yml` — bundle insertion
- `locale/` — zh/en trailer strings
- `scripts/` — build plus manifest, syntax and i18n checks used locally and in CI
- `docs/architecture.md` — slot map, state, keyboard and notification internals

## Known limitations

- Session deletion depends on the client contract; this build of DeepSeek Harness does not
  expose it, so the session dialog disables delete and points to archive instead.
- Archiving a session that is still running is rejected by the host; the dialog surfaces
  the error rather than forcing it.
- System notifications follow the OS/browser notification permission and the harness
  WebView autoplay policy for the chime.
- The plugin targets the current client slot and service surface; a harness update that
  renames those slots would need a matching plugin update.

## Development

```bash
npm ci                          # toolchain: typescript + esbuild
npm run typecheck               # tsc --noEmit (strict)
npm run build                   # src/ -> client.js + index.js
npm run check                   # typecheck, manifest/exports/syntax, i18n parity
npm test                        # bundle + shortcut regression suite
```

`client.js` and `index.js` are generated; CI rebuilds them and fails if the committed
artifacts differ from `src/`. All checks run on every push and pull request
(`.github/workflows/check.yml`).

## License

Licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/),
the same license as [cgartlab.com](https://cgartlab.com).

Copyright (c) 2025-2026 CGArtLab.




