# CherryNIK Audio Sidebar

A compact Obsidian player for the `Audio` folder. Selecting an audio folder in Files or Nested Pages updates the track list. Playback continues when you browse notes or folders.

Only one file can play at a time. Starting another track changes the source of the same audio element. The queue stays tied to the folder where playback began, so Previous and Next work while browsing elsewhere. A track finishing starts the next one; Repeat One can be enabled in the player. The footer uses Plyr's complete audio controls for seek, volume and speed, with small separate buttons for the folder queue. There is no settings page, SFX mixer, ambient-loop mode, or music overlap.

Playing an audio file inside a note hands it to the persistent sidebar player. macOS media keys and Obsidian commands can change tracks. Volume and speed persist across restarts.

The audio plugin is separate from [CherryNIK Explorer Shortcuts](https://github.com/cherrynik/obsidian-explorer-shortcuts), which controls keyboard navigation in Obsidian's Files panel.

## Development

[Plyr](https://github.com/sampotts/plyr) provides the complete audio controls over one native HTML audio element. Its styles and icon sprite are bundled locally, so the player does not need a CDN at runtime. Source is in `src/`; `main.js` and `styles.css` are bundled BRAT release artifacts. Run `npm ci && npm run check` before publishing. The Plyr MIT license is included in the generated bundle.

## Credits

Originally forked from [pjeurien/obsidian-audio-sidebar](https://github.com/pjeurien/obsidian-audio-sidebar). Distributed under the MIT License.
