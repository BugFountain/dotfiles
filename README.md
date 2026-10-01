# Diego’s Mac terminal dotfiles (Stack B)

Portable **Ghostty + zsh + Starship** setup. Drag this folder onto any Mac, run one command.

## One-command install

```bash
cd /path/to/dotfiles && ./install.sh
```

Installs Homebrew (if needed), Ghostty, Monocraft, Starship, antidote plugins, atuin/fzf/zoxide/mise, and the eza/bat/rg/fd/delta/lazygit kit. Symlinks configs. Opens Ghostty.

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

Agent-safe lean shell: skips Starship/plugins when `CURSOR_AGENT`, `COMPOSER_NO_INTERACTION`, or `CLAUDE_CODE_CHILD_SESSION` is set.

## Layout

```
dotfiles/
  install.sh
  Brewfile
  starship.toml
  ghostty/config
  fonts/Monocraft-…
  zsh/{zshenv,zprofile,zshrc,lean-path,runtimes,aliases,…}
```

## After install

- New Ghostty tab → Starship prompt
- `⌘,` / `⌘⇧,` Ghostty config
- Rollback: copy files from a local `backups/` (created on first install; not in git)

## Optional later

- herdr for multi-agent panes: https://herdr.dev/
- Migrate nvm/rbenv fully onto mise when ready
