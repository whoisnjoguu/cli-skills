# Color and accessibility

How a TUI chooses, degrades and themes colors, and how it stays usable for people with low vision, color vision deficiency, motion sensitivity, screen readers or limited fonts. Load this when picking a palette, adding themes or animations, or auditing a TUI for accessibility. Basic `NO_COLOR` handling and non-TTY fallback for the command-line surface are in [CLI-BASELINE.md](CLI-BASELINE.md); rendering mechanics (diffing, flicker, Unicode width) are in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md).

## Color depth reference

| Depth | How to detect | SGR form | Degrade to |
| --- | --- | --- | --- |
| 24-bit (truecolor) | `COLORTERM=truecolor` or `24bit`; terminfo `RGB`/`Tc` extended capability | `ESC[38;2;R;G;Bm` | nearest of 256 |
| 256 | `TERM` ends in `-256color`; terminfo `colors#256` (`tput colors`) | `ESC[38;5;Nm` | nearest of 16 |
| 16 (ANSI) | `TERM` known to terminfo with `colors#8` or more | `ESC[30–37m`, `ESC[90–97m` | none, keep attributes |
| none | `NO_COLOR` set, app `--no-color`, `TERM=dumb`, terminfo `colors` absent | bold, underline, reverse only | — |

Libraries that already implement detection and downsampling: termenv and Lip Gloss (Go), crossterm `style::available_color_count` and the `supports-color` crate (Rust), Rich and Textual (Python), `supports-color`/chalk levels (Node). Prefer them over hand-rolled checks.

## Color

### TUI-CLR-001: Detect color depth from the environment and terminfo

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Decide the color depth once at startup from, in order: app-level override (flag/config), `NO_COLOR`, `COLORTERM` (`truecolor` or `24bit` means 24-bit), terminfo (`colors`, `RGB`/`Tc`), then the `TERM` suffix (`-256color`). `TERM=dumb` or a `TERM` with no terminfo entry means no color. Do not infer depth from `TERM_PROGRAM` or terminal names alone; see [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md).

```go
func colorDepth() int { // 24, 8 (256 colors), 4 (16 colors), 0 (none)
	if v := os.Getenv("NO_COLOR"); v != "" {
		return 0
	}
	switch os.Getenv("COLORTERM") {
	case "truecolor", "24bit":
		return 24
	}
	term := os.Getenv("TERM")
	switch {
	case term == "" || term == "dumb":
		return 0
	case strings.HasSuffix(term, "-256color"):
		return 8
	}
	return 4 // refine with terminfo "colors" if available
}
```

**Verify:** Grep for `COLORTERM`, `TERM`, `tput colors`, `available_color_count`, `termenv`, `color_system`, or `supports-color`. Run `COLORTERM= TERM=xterm mytool`, `TERM=xterm-256color mytool` and `COLORTERM=truecolor mytool` inside a pty (for example under `script -qec 'mytool' /dev/null`) and confirm the emitted SGR forms change (`38;2;`, `38;5;`, `3x`/`9x`).

### TUI-CLR-002: Degrade colors to the detected depth

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Define themes in the richest form you want, then map every color down to the detected depth: truecolor to the nearest of the 256-color cube/grayscale ramp, 256 to the nearest of the 16 ANSI colors, 16 to no color (attributes only). Never emit `38;2;` sequences to a 256-color or 16-color terminal; many render them as garbage or the wrong color, and older multiplexers drop them. Use perceptual distance (for example CIELAB or a weighted RGB distance) when picking the nearest color so hues stay recognizable.

**Verify:** Run under a pty with `TERM=xterm COLORTERM= mytool` and capture output (`script -qec 'mytool' out.log`, then `grep -c $'\e\\[38;2;' out.log`); the count must be 0. Repeat with `TERM=xterm-256color` and confirm only `38;5;` and 16-color forms appear.

### TUI-CLR-003: Honor NO_COLOR in the full-screen UI and keep focus visible

- **Level:** must
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://no-color.org>

When `NO_COLOR` is set to a non-empty value, emit no foreground or background color in the interactive UI as well as in plain output. `NO_COLOR` is about color, not all styling: keep bold, underline and reverse video so selection, focus and errors remain distinguishable. A list whose selection is shown only by a blue background becomes unusable under `NO_COLOR`; render it with reverse video plus a marker such as `>`.

**Verify:** Run `NO_COLOR=1 mytool` in a pty, capture output, and check that no `ESC[3xm`, `ESC[4xm`, `ESC[9xm`, `38;`, or `48;` sequences appear. Interactively confirm the focused item and selection are still visible.

### TUI-CLR-004: Provide an app-level color switch that overrides detection

- **Level:** should
- **Severity:** low
- **Check:** static, probe
- **Source:** original

Offer `--no-color` (and optionally `--color=auto|always|never`) plus a config key such as `color = "auto"`. Explicit app settings win over environment detection; follow the precedence described in [CLI-BASELINE.md](CLI-BASELINE.md). Also allow forcing a lower depth (`--color=16`, `color = "256"`) for terminals that misreport capabilities, and expose it in the settings screen if the TUI has one.

**Verify:** Run `mytool --help | cat` and look for a color option; check config docs for a color key. Run `COLORTERM=truecolor mytool --no-color` in a pty and confirm no color SGR sequences are emitted.

### TUI-CLR-005: Default to the terminal's ANSI palette and default colors

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Build the default theme from the 16 ANSI colors and the terminal's default foreground/background (SGR 39/49), mapped to semantic roles (error = red, success = green, warning = yellow, accent = blue or magenta). Users choose terminal themes for contrast and comfort; palette-relative colors inherit them, while hardcoded RGB values override them. Offer truecolor themes as opt-in. Avoid relying on bright black (color 8) for muted text: in some popular themes (Solarized Dark) it equals the background. Prefer the default foreground with the dim attribute, and check dim is legible because terminals render it differently.

**Verify:** Grep theme definitions for hex/RGB literals in the default theme; they should be absent or limited to opt-in themes. Capture output in a pty and confirm the default theme uses `3x`/`9x`/`39`/`49` codes. Switch the terminal between two themes and confirm the UI follows.

### TUI-CLR-006: Support light and dark backgrounds without painting a background

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Do not fill the screen with a hardcoded background color to make one palette work; leave the default background (SGR 49) and choose foregrounds that read on both light and dark terminals, or ship separate light and dark variants. Common failures: yellow or white text on a light background, blue or dark gray on black. If you must paint backgrounds (panels, selections), set both foreground and background explicitly on those cells so the pair is controlled.

**Verify:** Grep for global background fills (`48;2;`, `48;5;`, `Style::bg` on the root area, `background:` on `Screen` in Textual CSS). Run the app in a light theme (for example xterm `-rv` off, or a "Solarized Light"/"Tango Light" profile) and a dark theme and check every text element is readable.

### TUI-CLR-007: Query the background color only with a timeout and a fallback

- **Level:** consider
- **Severity:** low
- **Check:** static, probe
- **Source:** <https://invisible-island.net/xterm/ctlseqs/ctlseqs.html>

To pick light or dark variants automatically, send OSC 11 (`ESC]11;?ESC\`) followed by a DA1 request (`ESC[c`) and read the reply `ESC]11;rgb:RRRR/GGGG/BBBB` before the DA1 answer. If DA1 arrives first, or nothing arrives within ~100 ms, assume a default (dark is the common choice) and let the user override with config. `COLORFGBG` (set by some terminals as `fg;bg`) is a cheap hint when present. Never block startup waiting for the reply; see TUI-TRM-008 in [TERMINAL-COMPAT.md](TERMINAL-COMPAT.md). Lip Gloss, termenv and Textual include background detection you can reuse.

**Verify:** Grep for `]11;?` and confirm a timeout and DA1 sentinel wrap it. Run in a terminal that does not answer OSC 11 (for example `TERM=linux` on the Linux console, or under `screen`) and confirm startup is not delayed and a default theme is used.

### TUI-CLR-008: Meet WCAG contrast ratios in built-in themes

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://www.w3.org/TR/WCAG22/#contrast-minimum>

For every built-in truecolor or 256-color theme, check foreground/background pairs: aim for at least 4.5:1 for body text and 3:1 for large/bold headings and non-text UI such as borders that convey state ([WCAG 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast)). Pay attention to muted/secondary text, disabled items, selection highlights, and status bars, which are where themes usually fail. Palette-relative defaults (TUI-CLR-005) inherit the user's theme contrast, but still avoid known weak pairs such as blue on black.

```python
def lum(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def contrast(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)

assert contrast("#a0a0a0", "#1e1e1e") >= 4.5
```

**Verify:** Extract each theme's text/background pairs and compute ratios with a script like the one above; flag any text pair under 4.5:1. Add the check as a unit test over the theme table.

### TUI-CLR-009: Use colorblind-safe palettes for status and data

- **Level:** should
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

About 1 in 12 men has some color vision deficiency, most commonly red/green. Avoid red-versus-green as the only distinction for pass/fail, added/removed, or up/down; pair hues that differ in lightness as well (for example blue/orange), and combine color with symbols (TUI-ACC-001). For charts and heatmaps, use palettes designed for color vision deficiency (Okabe-Ito, viridis/cividis-style ramps) and offer a colorblind theme option.

**Verify:** Inspect status and diff colors in the theme. Run screenshots through a color-vision-deficiency simulator (for example the ones built into browser dev tools or `colorblind` image filters) and confirm states remain distinguishable.

### TUI-CLR-010: Let users configure and override themes

- **Level:** should
- **Severity:** low
- **Check:** static, manual
- **Source:** original

Expose colors through semantic role names (`error`, `selection.bg`, `border.focused`) in a config file rather than baking them into widgets, ship at least a palette-relative default plus light and dark variants, and allow per-role overrides. Validate theme files and fall back to the default theme with a warning on invalid values instead of crashing. Document the theme file location and role names.

**Verify:** Grep widget code for literal color values outside the theme module; they should be rare. Check docs for theme configuration. Set an invalid color in the theme file and confirm the app starts with a warning.

## Accessibility

### TUI-ACC-001: Never convey information by color alone

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** <https://www.w3.org/TR/WCAG22/#use-of-color>

Every state shown with color must also be shown with text, a symbol, or an attribute: `✓`/`✗` or `ok`/`FAIL` next to green/red, `+`/`-` columns in diffs, `[x]` for checked items, `*` or `(modified)` for dirty buffers, underline or reverse for links and selection. This covers color-blind users, `NO_COLOR`, monochrome terminals, and screen readers at once.

| State | Color alone (bad) | Color plus redundant cue (good) |
| --- | --- | --- |
| Failed job | red name | red `✗ build (failed)` |
| Selected row | blue background | reverse video plus `>` marker |
| Required field | red label | `Name *` with "required" in help |

**Verify:** Run `NO_COLOR=1 mytool` and walk every screen; any state that becomes invisible is a violation. Grep render code for branches that change only the style/color on state.

### TUI-ACC-002: Make every action keyboard-operable

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://www.w3.org/TR/WCAG22/#keyboard>

Mouse support is optional; keyboard support is not. Every action reachable by clicking, scrolling, or dragging must also have a key binding or be reachable by focus navigation (Tab/Shift-Tab, arrows) and activation (Enter/Space). Focus must never become trapped in a widget without a documented way out (Esc or Tab). Keymap design and discoverability are in [INPUT-AND-KEYBINDINGS.md](INPUT-AND-KEYBINDINGS.md).

**Verify:** Grep mouse event handlers and confirm each action has a keyboard equivalent. Run the app with mouse capture disabled (or without touching the mouse) and complete every primary task.

### TUI-ACC-003: Keep the focus indicator visible without color

- **Level:** must
- **Severity:** medium
- **Check:** manual
- **Source:** <https://www.w3.org/TR/WCAG22/#focus-visible>

The user must always be able to see which pane and which item has focus. Use reverse video, bold, a cursor marker, or a distinct border style (double vs single line) in addition to a focus color, so focus survives `NO_COLOR`, 16-color themes, and low-vision settings.

**Verify:** Run `NO_COLOR=1 mytool`, press Tab through all panes and arrow through lists, and confirm focus is visible at every step.

### TUI-ACC-004: Provide a reduced-motion setting

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** <https://www.w3.org/TR/WCAG22/#pause-stop-hide>

Spinners, smooth scrolling, animated transitions, and marquee text distract some users, burn bandwidth over SSH, and confuse screen readers. Offer a config key or flag (for example `animations = false`) that replaces spinners with static text (`Loading…`), disables transitions, and jumps instead of scrolling smoothly. Any auto-updating content that lasts more than five seconds should be pausable. Reuse framework switches where they exist (Textual reads `TEXTUAL_ANIMATIONS=none|basic|full`).

**Verify:** Grep for the setting and confirm animation code paths check it. Run with animations disabled, capture output in a pty for a few seconds while idle, and confirm output stops when nothing changes.

### TUI-ACC-005: Never flash the screen or content

- **Level:** must
- **Severity:** high
- **Check:** static, manual
- **Source:** <https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold>

Do not flash more than three times per second, and avoid flashing altogether: no blinking text (SGR 5/6) for alerts, no reverse-video screen flashes (`ESC[?5h`/`ESC[?5l`) as a visual bell, no rapid full-screen color alternation. Signal alerts with a persistent status-line message or a single highlight change instead.

**Verify:** Grep for `\x1b[5m`, `\x1b[6m`, `?5h`, `blink`, and `flash`. Trigger errors and alerts interactively and confirm nothing flashes.

### TUI-ACC-006: Keep the terminal cursor at the focused element

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

Screen readers (Orca, VoiceOver, NVDA) and screen magnifiers follow the hardware cursor. After each frame, move the cursor to the focused item or input position, even if you draw your own highlight; hiding the cursor and leaving it at the bottom-right corner makes the app unusable with these tools. If a visible cursor clashes with the design, offer a setting that shows it.

**Verify:** Run the app, move focus around, and observe the hardware cursor position (temporarily show it with an accessibility setting if hidden). With a screen magnifier or screen reader, confirm the view follows focus.

### TUI-ACC-007: Offer a plain line-oriented or non-interactive mode

- **Level:** should
- **Severity:** high
- **Check:** static, probe
- **Source:** original

Full-screen TUIs are hard to use with screen readers and braille displays because the screen is a grid redrawn in place rather than a stream of text. Provide an alternative for every core task: subcommands with flags that print results line by line, a `--plain`/accessible mode that asks questions as sequential prompts (Huh's accessible mode is one example), or both. Document it prominently.

**Verify:** Check `mytool --help | cat` and docs for a plain or accessible mode and non-interactive subcommands. Run them under `| cat` and confirm output contains no cursor-movement sequences (`ESC[H`, `ESC[?1049h`).

### TUI-ACC-008: Announce state changes in text

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://www.w3.org/TR/WCAG22/#status-messages>

When something changes outside the focused element (a background job finishes, a save fails, a connection drops), write a short text message to a consistent status line or message area, not only an icon or color change. In plain/accessible mode, print the message as a new line so screen readers read it. Keep messages long enough on screen to be read, or keep them in a viewable message log.

**Verify:** Trigger a background completion and an error; confirm a text message appears in a fixed location (and as a new line in plain mode) and that it is recoverable from a log or history view.

### TUI-ACC-009: Avoid needless full-screen redraws

- **Level:** should
- **Severity:** medium
- **Check:** probe, manual
- **Source:** original

Screen readers announce changed screen regions; clearing and repainting the whole screen on every tick makes them re-read everything or go silent. Redraw only changed cells, stop redrawing when idle, and don't update clocks or spinners every frame when nothing meaningful changed. Rendering techniques are in [LAYOUT-AND-RENDERING.md](LAYOUT-AND-RENDERING.md).

**Verify:** Run in a pty and capture output for 10 seconds while idle (`script -qec 'timeout 10 mytool' idle.log`); output size should stop growing after the first frame. Grep for `ESC[2J` in the render loop.

### TUI-ACC-010: Lay out in cells and adapt to font size changes

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** <https://www.w3.org/TR/WCAG22/#resize-text>

Users enlarge text by zooming the terminal font, which reduces the number of rows and columns. Treat that as an ordinary resize, keep content usable down to the documented minimum size, and show a clear "terminal too small" message below it. Do not assume a cell aspect ratio (commonly near 1:2 but font-dependent) for charts, circles, or ASCII art; if pixel geometry matters, query it (`TIOCGWINSZ` pixel fields or `CSI 16 t`) and fall back gracefully.

**Verify:** Zoom the terminal font in steps (Ctrl-+ in most terminals) while the app runs; confirm layout reflows and nothing essential is cut off until the "too small" message appears.

### TUI-ACC-011: Do not put essential information only in art or box drawing

- **Level:** should
- **Severity:** medium
- **Check:** manual
- **Source:** original

ASCII-art logos, sparklines, braille charts, gauges, and box-drawing diagrams are read by screen readers as noise or skipped. Pair each with a text value (`CPU 73%` next to the bar, the numeric latest value next to a sparkline) and keep titles and labels as plain text, not banner fonts.

**Verify:** Review each chart, gauge, and decorative element; confirm the same information is available as text on screen or in plain mode.

### TUI-ACC-012: Provide an ASCII fallback for box drawing and symbols

- **Level:** should
- **Severity:** medium
- **Check:** static, probe
- **Source:** original

Box-drawing characters, braille, and symbols like `✓` or `…` render as `?` or mojibake when the locale is not UTF-8, on the Linux console with limited fonts, and in some Windows consoles. If `LC_ALL`/`LC_CTYPE`/`LANG` do not indicate UTF-8, or the user sets `ascii = true`, draw borders with `+-|`, checkmarks with `[x]`, and ellipses with `...`.

**Verify:** Run `LANG=C LC_ALL=C mytool` in a pty and confirm the UI uses ASCII only (`LC_ALL=C grep -P '[^\x00-\x7F]' captured.log` finds nothing) and remains legible.

### TUI-ACC-013: Do not require Nerd Fonts or other patched fonts

- **Level:** must
- **Severity:** medium
- **Check:** static, manual
- **Source:** original

Nerd Font icons live in the Unicode Private Use Area and appear as empty boxes or tofu without a patched font, and screen readers cannot name them. There is no reliable way to detect the font, so make icons opt-in (for example `icons = "nerd" | "unicode" | "none"`, default `unicode` or `none`), never use an icon as the only label for an action or state, and keep column widths correct when icons are disabled.

**Verify:** Grep source for Private Use Area code points (`rg -P '[\x{E000}-\x{F8FF}]'` for literal glyphs, plus escaped forms such as `\u{e`/`\uE`/`\uF`) and confirm they are behind a setting. Run with icons disabled and confirm no information is lost.
