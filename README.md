# Duck.ai Tools

Duck.ai is a private conversation feature of DuckDuckGo that lets you chat with various AI models. Conversations are anonymized and your chat history stays local.

The biggest downside is that Duck.ai, at present, lacks an easy way to export and archive conversations. While you can manually select and export chats, the resulting text files aren't user-friendly.

That's why I created this repository. It provides quality-of-life tools and scripts to simplify exporting past conversations from Duck.ai and make the process more power-user friendly.

## Tools

- [Conversations History Export Bookmarklet](src/export-bookmarklet/README.md) — a bookmarklet to export all your locally stored conversations as a JSON file.
- [Quick Switch Userscript](src/quick-switch-userscript/README.md) — a userscript that adds a Spotlight-style recent chat switcher.
- [Transcripts](src/transcripts/README.md) — a TUI for browsing exported conversations and exporting them as Markdown or HTML.
