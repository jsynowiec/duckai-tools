import asyncio
import json
import sys
from pathlib import Path
from typing import List

from textual import work
from textual.app import App

from transcripts.models import Chat
from transcripts.screens.chat_list import ChatListScreen
from transcripts.screens.chat_view import ChatViewScreen
from transcripts.screens.export_dialog import ExportDialogScreen
from transcripts.screens.loading import LoadingScreen


def load_chats_from_export(export_path: Path) -> List[Chat]:
    """Load chats from an IndexedDB export JSON file."""
    with open(export_path, "r") as f:
        data = json.load(f)

    chats = []

    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object at top level")

    stores = data.get("stores", {})
    if not isinstance(stores, dict):
        raise ValueError("Expected 'stores' to be an object")

    for _, store_def in stores.items():
        if not isinstance(store_def, dict):
            continue
        records = store_def.get("data", [])
        if not isinstance(records, list):
            continue

        for record in records:
            if not isinstance(record, dict):
                continue
            if all(k in record for k in ("chatId", "messages", "title")):
                try:
                    chats.append(Chat.model_validate(record))
                except Exception as e:
                    print(f"Warning: skipping invalid chat record: {e}", file=sys.stderr)
                    continue

    return chats


class TranscriptsApp(App):
    SCREENS = {
        "loading": LoadingScreen,
        "chat_list": ChatListScreen,
        "chat_view": ChatViewScreen,
        "export_dialog": ExportDialogScreen,
    }

    def __init__(self, export_path: Path, **kwargs):
        super().__init__(**kwargs)
        self.export_path = export_path
        self.chats: List[Chat] = []
        self.current_chat: Chat | None = None

    def on_mount(self) -> None:
        self.push_screen("loading")
        self._load_chats_async()

    @work(exclusive=True)
    async def _load_chats_async(self) -> None:
        try:
            self.chats = await asyncio.to_thread(load_chats_from_export, self.export_path)
        except Exception as exc:
            self.notify(f"Failed to load export: {exc}", severity="error")
            self.exit()
            return

        if not self.chats:
            self.notify("No chats found in export file", severity="error")
            self.exit()
            return

        self.pop_screen()
        self.push_screen("chat_list")


def main():
    if len(sys.argv) < 2:
        print("Usage: transcripts <export.json>")
        sys.exit(1)

    export_path = Path(sys.argv[1])
    if not export_path.exists():
        print(f"Error: file not found: {export_path}")
        sys.exit(1)

    app = TranscriptsApp(export_path)
    app.run()


if __name__ == "__main__":
    main()
