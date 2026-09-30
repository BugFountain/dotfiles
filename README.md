# Diego’s Mac terminal dotfiles

Portable Ghostty setup. Drag this folder onto any Mac, run one command, done.

## One-command install

```bash
cd /path/to/dotfiles && ./install.sh
```

What it does:

1. Installs Homebrew if missing
2. Installs **Ghostty**
3. Installs **Monocraft Nerd Font** (Homebrew cask, or from `fonts/` in this folder)
4. Symlinks `~/.config/ghostty` → this repo’s `ghostty/`
5. Opens Ghostty

Safe to re-run (idempotent). Does **not** touch your zsh / Oh My Zsh / p10k setup.

## Drag-and-drop

Copy the whole `dotfiles` folder (USB, AirDrop, git clone — whatever). The `fonts/` copy of Monocraft is included so a fresh Mac still looks right offline.

## Layout

```
dotfiles/
  install.sh          # bootstrap
  Brewfile            # optional: brew bundle
  ghostty/config      # Ghostty settings
  fonts/              # Monocraft Nerd Font fallback
  README.md
```

## After install

- Open Ghostty (Spotlight → Ghostty)
- `⌘,` opens config; `⌘⇧,` reloads
- Theme: Catppuccin Mocha · Font: Monocraft 15 (same as your iTerm)

## Optional later

- herdr for multi-agent panes: https://herdr.dev/
- Superlogical waitlist (next-gen mux): https://superlogical.com/
