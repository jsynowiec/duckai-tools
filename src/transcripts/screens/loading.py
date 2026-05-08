from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Header, LoadingIndicator, Static


class LoadingScreen(Screen):
    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("Loading chats...", id="loading-title")
        yield LoadingIndicator(id="loading-indicator")
