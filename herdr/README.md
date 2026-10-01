# herdr (Stack B)

Opt-in multi-agent terminal workspace. Ghostty stays the outer terminal — run `herdr` when you want panes.

## Install / link

`install.sh` installs the Homebrew formula and symlinks:

```text
~/.config/herdr/config.toml → ~/dotfiles/herdr/config.toml
```

Or by hand:

```bash
brew install herdr
mkdir -p ~/.config/herdr
ln -sfn ~/dotfiles/herdr/config.toml ~/.config/herdr/config.toml
```

## Day-1 lean shell

Herdr sets `HERDR_ENV=1` inside panes. Lean zsh (skip Starship/plugins) also needs `HERDR_LEAN=1`. There is **no** `config.toml` pane-env key for this — export it before attach, or pass `--env` when launching panes:

```bash
export HERDR_LEAN=1
herdr
```

```bash
# when splitting / launching from CLI
herdr pane split --env HERDR_LEAN=1
# or start agents with lean inherited from the attach shell
```

Verify in a herdr pane: `echo $HERDR_ENV $HERDR_LEAN` → `1 1`, and the prompt should be the short lean `user@host:path$` (no Starship).

## Integrations

Claude + Cursor CLI only (Grok Bot cannot live in herdr; Grok Build CLI optional later):

```bash
herdr integration install claude   # if ~/.claude exists
herdr integration install cursor   # if ~/.cursor + cursor-agent/agent on PATH
herdr integration status
```

OpenInspect stays an observer shell pane — no herdr integration.

## Prefix

`ctrl+b` (tmux-style). Custom chords:

| Chord | Action |
|-------|--------|
| `prefix+alt+c` | start `claude` |
| `prefix+alt+a` | start `cursor-agent` |

`prefix+?` shows the full help panel.
