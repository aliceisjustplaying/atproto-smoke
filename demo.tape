# atproto-smoke demo recording
# Replays output from a real successful dual-account smoke run.
# Run: vhs demo.tape

Output demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 16
Set Width 1200
Set Height 600
Set TypingSpeed 50ms
Set PlaybackSpeed 0.5
Set Shell "zsh"

Hide
Type "alias node='sh data/browser-smoke/demo-replay.sh #'"
Enter
Sleep 300ms
Type "PS1='atproto-smoke $ '"
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 500ms
Show

Type "node dist/bin/atproto-smoke.js run-dual --config config.json"
Sleep 500ms
Enter
Sleep 120s

Hide
