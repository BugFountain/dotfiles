# Fast PATH exports — safe to source from ~/.zshenv on every zsh start.
# Version managers: shims/default bin here (fast). Full init lazy in runtimes.zsh.

export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.rbenv/bin:$PATH"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

export VAPI_INSTALL="$HOME/.vapi"
export PATH="$VAPI_INSTALL/bin:$PATH"
export MANPATH="${VAPI_INSTALL}/share/man:${MANPATH:-}"

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

export NVM_DIR="$HOME/.nvm"

export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

# rbenv shims work without `rbenv init` — ruby/bundle/rails available immediately.
[[ -d "$HOME/.rbenv/shims" ]] && export PATH="$HOME/.rbenv/shims:$PATH"

# Default nvm node on PATH without sourcing nvm.sh (~800ms saved per interactive tab).
_zsh_nvm_resolve_version() {
  local input="$1" path

  input="${input//[[:space:]]/}"
  [[ -n "$input" ]] || return 1

  if [[ "$input" == v* ]] || [[ "$input" =~ '^[0-9]+\.' ]]; then
    [[ "$input" != v* ]] && input="v${input}"
    print -r -- "$input"
    return 0
  fi

  if [[ "$input" == lts/* ]]; then
    path="${NVM_DIR}/alias/lts/${input#lts/}"
  elif [[ -f "${NVM_DIR}/alias/lts/${input}" ]]; then
    path="${NVM_DIR}/alias/lts/${input}"
  elif [[ -f "${NVM_DIR}/alias/${input}" ]]; then
    path="${NVM_DIR}/alias/${input}"
  else
    return 1
  fi

  [[ -f "$path" ]] || return 1
  _zsh_nvm_resolve_version "$(<"$path")"
}

_zsh_nvm_default_bin() {
  local version bin

  [[ -f "${NVM_DIR}/alias/default" ]] || return 1
  version="$(_zsh_nvm_resolve_version "$(<"${NVM_DIR}/alias/default")")" || return 1
  bin="${NVM_DIR}/versions/node/${version}/bin"
  [[ -d "$bin" ]] && print -r -- "$bin"
}

if bin="$(_zsh_nvm_default_bin 2>/dev/null)"; then
  case ":$PATH:" in
    *":${bin}:"*) ;;
    *) export PATH="${bin}:$PATH" ;;
  esac
  unset bin
fi
unset -f _zsh_nvm_resolve_version _zsh_nvm_default_bin 2>/dev/null
