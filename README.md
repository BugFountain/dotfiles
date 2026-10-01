# Diego’s Mac terminal dotfiles (Stack B)

Portable **Ghostty + zsh + Starship** setup. Drag this folder onto any Mac, run one command.

## One-command install

```bash
cd /path/to/dotfiles && ./install.sh
```

Installs Homebrew (if needed), Ghostty, Monocraft, Starship, antidote plugins, atuin/fzf/zoxide/mise, herdr, and the eza/bat/rg/fd/delta/lazygit kit. Symlinks configs (including herdr). Opens Ghostty.

## Stack

| Layer | Choice |
|-------|--------|
| Terminal | Ghostty · cyberpunk · Monocraft |
| Shell | zsh (no Oh My Zsh / no Powerlevel10k) |
| Prompt | Starship (cyberpunk powerline) |
| Plugins | antidote → autosuggestions, syntax-highlighting, completions |
| History | atuin + fzf |
| Nav | zoxide |
| Runtimes | mise (+ existing nvm/rbenv lean PATH kept) |
| CLI | eza, bat, ripgrep, fd, delta, lazygit |
| Multiplexer | herdr (opt-in; Ghostty stays default) |

Agent-safe lean shell: skips Starship/plugins when `CURSOR_AGENT`, `COMPOSER_NO_INTERACTION`, `CLAUDE_CODE_CHILD_SESSION`, or (`HERDR_ENV` + `HERDR_LEAN=1`) is set.

## Layout

```
dotfiles/
  install.sh
  Brewfile
  starship.toml
  ghostty/config
  herdr/{config.toml,README.md}
  fonts/Monocraft-…
  zsh/{zshenv,zprofile,zshrc,lean-path,runtimes,aliases,completions/…}
```

## After install

- New Ghostty tab → Starship prompt
- `⌘,` / `⌘⇧,` Ghostty config
- Optional multi-agent panes: `export HERDR_LEAN=1 && herdr` (see `herdr/README.md`) — Ghostty does **not** auto-launch herdr
- Rollback: copy files from a local `backups/` (created on first install; not in git)

## Optional later

- Grok Build CLI herdr integration (Grok Bot cannot live in herdr)
- Migrate nvm/rbenv fully onto mise when ready
