#!/usr/bin/env bash
# One-shot Mac bootstrap — Ghostty + Stack B shell.
# Usage: cd /path/to/dotfiles && ./install.sh
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
GHOSTTY_DIR="$CONFIG_HOME/ghostty"
FONT_SRC="$DOTFILES/fonts/Monocraft-nerd-fonts-patched.ttc"
FONT_DST="$HOME/Library/Fonts/Monocraft-nerd-fonts-patched.ttc"
BACKUP_DIR="$DOTFILES/backups/pre-install-$(date +%Y%m%d%H%M%S)"

need_mac() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "macOS installer. On Linux: install deps yourself, then symlink zsh + ghostty configs from $DOTFILES"
    exit 1
  fi
}

ensure_brew() {
  if command -v brew >/dev/null 2>&1; then return 0; fi
  echo "→ Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)"; fi
  command -v brew >/dev/null 2>&1 || { echo "brew not on PATH — open a new terminal and re-run"; exit 1; }
}

brew_pkgs() {
  echo "→ Installing Stack B packages (Brewfile)…"
  HOMEBREW_NO_AUTO_UPDATE=1 brew bundle --file="$DOTFILES/Brewfile" || true
  # Ghostty cask may already be present; ensure CLI tools exist
  local pkgs=(starship atuin fzf zoxide eza bat ripgrep fd git-delta lazygit antidote mise herdr)
  local missing=()
  for p in "${pkgs[@]}"; do
    brew list --formula "$p" >/dev/null 2>&1 || missing+=("$p")
  done
  if ((${#missing[@]})); then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install "${missing[@]}"
  fi
  if [[ ! -d /Applications/Ghostty.app ]]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask ghostty
  else
    echo "✓ Ghostty already installed"
  fi
}

install_font() {
  if ls "$HOME/Library/Fonts"/Monocraft* >/dev/null 2>&1; then
    echo "✓ Monocraft already in ~/Library/Fonts"; return 0
  fi
  echo "→ Installing Monocraft Nerd Font…"
  if HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask font-monocraft-nerd-font 2>/dev/null; then
    echo "✓ Font via Homebrew"
  elif [[ -f "$FONT_SRC" ]]; then
    mkdir -p "$HOME/Library/Fonts"
    cp -f "$FONT_SRC" "$FONT_DST"
    echo "✓ Font from bundled fonts/"
  else
    echo "⚠ Monocraft missing — Ghostty will fall back to system mono"
  fi
}

backup_file() {
  local f="$1"
  [[ -e "$f" || -L "$f" ]] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -a "$f" "$BACKUP_DIR/"
}

link_shell() {
  echo "→ Linking shell configs…"
  backup_file "$HOME/.zshrc"
  backup_file "$HOME/.zshenv"
  backup_file "$HOME/.zprofile"
  # Keep ~/.p10k.zsh on disk but unused (rollback)
  ln -sfn "$DOTFILES/zsh/zshrc" "$HOME/.zshrc"
  ln -sfn "$DOTFILES/zsh/zshenv" "$HOME/.zshenv"
  ln -sfn "$DOTFILES/zsh/zprofile" "$HOME/.zprofile"
  echo "✓ ~/.zshrc ~/.zshenv ~/.zprofile → $DOTFILES/zsh/"
}

link_starship_ghostty() {
  mkdir -p "$CONFIG_HOME"
  backup_file "$CONFIG_HOME/starship.toml"
  ln -sfn "$DOTFILES/starship.toml" "$CONFIG_HOME/starship.toml"

  if [[ -e "$GHOSTTY_DIR" && ! -L "$GHOSTTY_DIR" ]]; then
    mkdir -p "$BACKUP_DIR"
    mv "$GHOSTTY_DIR" "$BACKUP_DIR/ghostty"
  fi
  ln -sfn "$DOTFILES/ghostty" "$GHOSTTY_DIR"
  echo "✓ Ghostty + Starship configs linked"
}


link_herdr() {
  echo "→ Linking herdr config…"
  local herdr_dir="$CONFIG_HOME/herdr"
  mkdir -p "$herdr_dir"
  backup_file "$herdr_dir/config.toml"
  ln -sfn "$DOTFILES/herdr/config.toml" "$herdr_dir/config.toml"
  echo "✓ ~/.config/herdr/config.toml → $DOTFILES/herdr/config.toml"
  if command -v herdr >/dev/null 2>&1; then
    echo "  herdr $(herdr --version 2>/dev/null || true) — opt-in: run \`herdr\` (Ghostty unchanged)"
  else
    echo "⚠ herdr not on PATH yet — brew install herdr, then re-run or open a new shell"
  fi
}

prime_antidote() {
  # Warm plugin bundle so first interactive shell is fast
  if [[ -r /opt/homebrew/opt/antidote/share/antidote/antidote.zsh ]]; then
    zsh -c 'source /opt/homebrew/opt/antidote/share/antidote/antidote.zsh && antidote bundle < "$DOTFILES/zsh/zsh_plugins.txt" >/dev/null' \
      && echo "✓ antidote plugins bundled" || echo "⚠ antidote bundle skipped (ok on first open)"
  fi
}

git_delta_hint() {
  if command -v delta >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
    git config --global core.pager delta 2>/dev/null || true
    git config --global interactive.diffFilter "delta --color-only" 2>/dev/null || true
    git config --global delta.navigate true 2>/dev/null || true
    echo "✓ git pager → delta"
  fi
}

open_ghostty() {
  [[ -d /Applications/Ghostty.app ]] && open -a Ghostty || true
}

main() {
  echo "═══ Diego dotfiles → Stack B ═══"
  echo "From: $DOTFILES"
  need_mac
  ensure_brew
  brew_pkgs
  install_font
  link_shell
  link_starship_ghostty
  link_herdr
  export DOTFILES
  prime_antidote
  git_delta_hint
  open_ghostty
  echo
  echo "Done. Open a new Ghostty tab to load Starship. Optional: herdr (see herdr/README.md)."
  echo "Rollback copies (if any): $BACKUP_DIR"
  echo "Legacy p10k left at ~/.p10k.zsh (unused)."
}

main "$@"
