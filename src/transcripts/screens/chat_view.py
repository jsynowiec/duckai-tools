from textual.app import ComposeResult
from textual.containers import ScrollableContainer
from textual.screen import Screen
from textual.widgets import Footer, Header, Markdown

from transcripts.rendering import render_chat


class ChatViewScreen(Screen):
    BINDINGS = [
        ("escape", "back", "Back"),
        ("e", "export", "Export"),
        ("g", "go_to_line", "Go to line"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        with ScrollableContainer():
            yield Markdown(id="markdown-preview")
        yield Footer()

    def on_screen_resume(self) -> None:
        chat = self.app.current_chat
        if chat:
            md_content = render_chat(chat, "md")
        else:
            md_content = "*No chat selected*"
        self.query_one("#markdown-preview", Markdown).update(md_content)
        self.query_one(ScrollableContainer).scroll_home(animate=False)

    def action_back(self) -> None:
        self.app.pop_screen()

    def action_export(self) -> None:
        if self.app.current_chat:
            self.app.push_screen("export_dialog")

    def action_go_to_line(self) -> None:
        # Simple go-to-line: we'll implement a small input dialog later
        # For now, just a placeholder
        pass
