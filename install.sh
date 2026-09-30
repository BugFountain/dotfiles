#!/usr/bin/env bash
# One-shot Mac bootstrap for Diego's Ghostty dotfiles.
# Usage: cd /path/to/dotfiles && ./install.sh
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
GHOSTTY_DIR="$CONFIG_HOME/ghostty"
FONT_SRC="$DOTFILES/fonts/Monocraft-nerd-fonts-patched.ttc"
FONT_DST="$HOME/Library/Fonts/Monocraft-nerd-fonts-patched.ttc"

need_mac() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer targets macOS. On Linux, install Ghostty from your distro and symlink:"
    echo "  mkdir -p \"$CONFIG_HOME\" && ln -sfn \"$DOTFILES/ghostty\" \"$GHOSTTY_DIR\""
    exit 1
  fi
}

ensure_brew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  echo "→ Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew install finished but brew is not on PATH. Open a new terminal and re-run ./install.sh"
    exit 1
  fi
}

install_ghostty() {
  if [[ -d /Applications/Ghostty.app ]]; then
    echo "✓ Ghostty already installed"
    return 0
  fi
  echo "→ Installing Ghostty…"
  HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask ghostty
}

install_font() {
  local ok=0
  if fc-list 2>/dev/null | grep -qi 'Monocraft'; then
    echo "✓ Monocraft already available"
    return 0
  fi
  if ls "$HOME/Library/Fonts"/Monocraft* >/dev/null 2>&1; then
    echo "✓ Monocraft already in ~/Library/Fonts"
    return 0
  fi

  echo "→ Installing Monocraft Nerd Font…"
  if HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask font-monocraft-nerd-font 2>/dev/null; then
    ok=1
  elif HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask font-monocraft 2>/dev/null; then
    ok=1
  fi

  if [[ $ok -eq 0 && -f "$FONT_SRC" ]]; then
    echo "→ Falling back to bundled font in fonts/"
    mkdir -p "$HOME/Library/Fonts"
    cp -f "$FONT_SRC" "$FONT_DST"
    ok=1
  fi

  if [[ $ok -eq 0 ]]; then
    echo "⚠ Could not install Monocraft. Ghostty will fall back to the system mono font."
    echo "  Copy a .ttc/.ttf into ~/Library/Fonts or: brew install --cask font-monocraft-nerd-font"
  else
    echo "✓ Font installed"
  fi
}

link_config() {
  mkdir -p "$CONFIG_HOME"
  if [[ -e "$GHOSTTY_DIR" && ! -L "$GHOSTTY_DIR" ]]; then
    local bak="$GHOSTTY_DIR.bak.$(date +%Y%m%d%H%M%S)"
    echo "→ Backing up existing $GHOSTTY_DIR → $bak"
    mv "$GHOSTTY_DIR" "$bak"
  fi
  ln -sfn "$DOTFILES/ghostty" "$GHOSTTY_DIR"
  echo "✓ Linked $GHOSTTY_DIR → $DOTFILES/ghostty"
}

open_ghostty() {
  if [[ -d /Applications/Ghostty.app ]]; then
    echo "→ Opening Ghostty…"
    open -a Ghostty
  fi
}

main() {
  echo "═══ Diego dotfiles → Ghostty ═══"
  echo "From: $DOTFILES"
  need_mac
  ensure_brew
  install_ghostty
  install_font
  link_config
  open_ghostty
  echo
  echo "Done. Ghostty config lives in this folder — drag the whole 'dotfiles' dir to another Mac and run ./install.sh again."
  echo "Reload config anytime with ⌘⇧,  ·  Edit with ⌘,"
}

main "$@"
