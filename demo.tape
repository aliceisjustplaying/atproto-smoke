# atproto-smoke demo recording
# Replays output from a real successful dual-account smoke run.
# Run: vhs demo.tape

Output demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 1200
Set Height 600
Set TypingSpeed 50ms
Set Shell "zsh"

Hide
Type "PS1='atproto-smoke $ '"
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 500ms
Show

Type "node bin/atproto-smoke.mjs run-dual --config config.json"
Sleep 1s

Hide
Ctrl+U
Type "sh data/browser-smoke/demo-replay.sh"
Show

Enter
Sleep 120s
