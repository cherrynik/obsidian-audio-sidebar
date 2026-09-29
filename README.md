# CherryNIK Audio Sidebar

A compact Obsidian player for the `Audio` folder. Selecting an audio folder in Files or Nested Pages updates the track list. Playback continues when you browse notes or folders.

Only one file can play at a time. Starting another track stops and releases the previous player. The queue stays tied to the folder where playback began, so Previous and Next work while browsing elsewhere. A track finishing starts the next one; Repeat One can be enabled in the player. The footer has seek, volume and speed controls. There is no settings page, SFX mixer, ambient-loop mode, or music overlap.

Playing an audio file inside a note hands it to the persistent sidebar player. macOS media keys and Obsidian commands can change tracks. Volume and speed persist across restarts.

The audio plugin is separate from [CherryNIK Explorer Shortcuts](https://github.com/cherrynik/obsidian-explorer-shortcuts), which controls keyboard navigation in Obsidian's Files panel.

## Development

[Howler.js](https://github.com/goldfire/howler.js) provides playback using its HTML5 streaming mode for large files. Source is in `src/`; `main.js` is the bundled BRAT release artifact. Run `npm ci && npm run check` before publishing. The Howler MIT license is included in the generated bundle.

## Credits

Originally forked from [pjeurien/obsidian-audio-sidebar](https://github.com/pjeurien/obsidian-audio-sidebar). Distributed under the MIT License.
