
# Aliases

alias pg_start="brew services start postgresql@16"
alias pg_stop="brew services stop postgresql@16"

# bun completions (interactive only — skip in lean mode)
if ! _zsh_is_lean_shell && [[ -s "$HOME/.bun/_bun" ]]; then
  source "$HOME/.bun/_bun"
fi

function iterm_title(){
  local title="$1"
  perl -e 'my $t=$ARGV[0]; print chr(27)."]1;$t".chr(7).chr(27)."]2;$t".chr(7);' "$title"
}
