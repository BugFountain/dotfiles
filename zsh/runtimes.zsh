# Version managers — lazy in interactive shells, eager for scripts/agents.
[[ -n "${_ZSH_RUNTIMES_LOADED:-}" ]] && return 0
_ZSH_RUNTIMES_LOADED=1

# Non-interactive shells skip ~/.zshrc — load fully so `zsh -c 'node …'` works.
if [[ ! -o interactive ]]; then
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
  [[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"
  if command -v rbenv >/dev/null 2>&1; then
    eval "$(rbenv init - zsh)"
  fi
  return 0
fi

# Interactive: node/ruby already on PATH via ~/.zsh/lean-path.zsh shims.
# Pay nvm/rbenv init cost only when you invoke the manager itself.

_zsh_load_nvm() {
  [[ -n "${_ZSH_NVM_LOADED:-}" ]] && return 0
  _ZSH_NVM_LOADED=1
  unset -f nvm _zsh_load_nvm 2>/dev/null
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
  [[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"
}

nvm() {
  _zsh_load_nvm
  nvm "$@"
}

_zsh_load_rbenv() {
  [[ -n "${_ZSH_RBENV_LOADED:-}" ]] && return 0
  _ZSH_RBENV_LOADED=1
  unset -f rbenv _zsh_load_rbenv 2>/dev/null
  command -v rbenv >/dev/null 2>&1 && eval "$(rbenv init - zsh)"
}

rbenv() {
  _zsh_load_rbenv
  rbenv "$@"
}
