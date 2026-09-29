# CherryNIK Audio Sidebar

A personal fork of [pjeurien/obsidian-audio-sidebar](https://github.com/pjeurien/obsidian-audio-sidebar).

The fork keeps the original audio features and adds:

- recursive audio discovery in nested folders;
- automatic loading when an Audio folder is selected in Files or Nested Pages;
- a persistent player that always continues while changing folders and notes.
- a compact native-player interface with icon-only controls.
- previous and next controls that keep the active folder queue while browsing.
- stable folder selection that ignores repeated clicks and disclosure toggles.
- automatic handoff from an audio player inside a note to the persistent Now Playing player.
- a stable single-track Now Playing area and a compact queue button showing previous, current, and upcoming tracks from the folder where playback started.
- one global volume control instead of a separate native volume control on every track.
- folder refresh and settings live in the folder header; repeat is a clearly labelled player control.
- pausing preserves the current track, playback position, and queue until Stop is pressed.
- repeat-one explicitly restarts the current track; a full-width timeline seeks through it, while queue, volume, and playback speed open on hover and close outside. Touch devices can open them by tapping.

## BRAT installation

Add `cherrynik/obsidian-audio-sidebar` in BRAT after the first GitHub release is published.

## Credits and license

Original plugin by Patriek Jeuriens. Distributed under the MIT License.
