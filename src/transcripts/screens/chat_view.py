import asyncio

from textual import work
from textual.app import ComposeResult
from textual.containers import ScrollableContainer
from textual.screen import Screen
from textual.widgets import Footer, Header, LoadingIndicator, Static

from transcripts.markdown_widgets import TranscriptMarkdown
from transcripts.rendering import render_chat


class ChatViewScreen(Screen):
    BINDINGS = [
        ("escape", "back", "Back"),
        ("e", "export", "Export"),
        ("g", "go_to_line", "Go to line"),
    ]

    def __init__(self) -> None:
        super().__init__()

    def compose(self) -> ComposeResult:
        yield Header()
        with ScrollableContainer(id="view-scroller"):
            yield Static("Loading transcript...", id="chat-loading-label")
            yield LoadingIndicator(id="chat-loading")
            yield TranscriptMarkdown(id="markdown-preview")
        yield Footer()

    def on_screen_resume(self) -> None:
        self._load_current_chat()

    @work(exclusive=True)
    async def _load_current_chat(self) -> None:
        chat = self.app.current_chat
        if chat:
            md_content = await asyncio.to_thread(render_chat, chat, "md")
        else:
            md_content = "*No chat selected*"

        self.query_one("#chat-loading-label", Static).display = False
        self.query_one("#chat-loading", LoadingIndicator).display = False
        md_widget = self.query_one("#markdown-preview", TranscriptMarkdown)
        md_widget.display = True
        md_widget.update(md_content)
        self.query_one("#view-scroller", ScrollableContainer).scroll_home(animate=False)

    def action_back(self) -> None:
        self.app.pop_screen()

    def action_export(self) -> None:
        if self.app.current_chat:
            self.app.push_screen("export_dialog")

    def action_go_to_line(self) -> None:
        pass
