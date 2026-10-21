// Pastes tile SVGs into the active Pen document, one after another (macOS only: it
// drives the clipboard and Pen's ⌘V through AppleScript).
//
//   node scripts/pen/paste-tiles.mjs <svg>…
//
// Open the board's file first with `open -a Pen designs/<stem>.pen`, then run
// place.js (written by tiles-from-dom.mjs) through the Pencil MCP. Escape twice
// before each paste, so a paste never lands inside the frame the last one selected.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

if (process.platform !== 'darwin') {
  console.error(
    'paste-tiles.mjs drives Pen through AppleScript, so it runs on macOS only',
  );
  process.exit(2);
}
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/pen/paste-tiles.mjs <svg>…');
  process.exit(2);
}
const PASTE = `
tell application "Pen" to activate
delay 0.4
tell application "System Events" to tell process "Pen"
  key code 53
  delay 0.2
  key code 53
  delay 0.2
  keystroke "v" using command down
end tell
delay 1.5`;
for (const file of files) {
  execFileSync('pbcopy', { input: readFileSync(file) });
  execFileSync('osascript', ['-e', PASTE]);
  console.log('pasted', file);
}
