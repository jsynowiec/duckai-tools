from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import Screen
from textual.widgets import Footer, Header, Markdown, OptionList
from textual.widgets.option_list import Option

from transcripts.ui_helpers import format_chat_list_row, render_chat_preview


class ChatListScreen(Screen):
    BINDINGS = [
        ("e", "export", "Export"),
    ]

    DEFAULT_CSS = """
    #list-pane {
        width: 33%;
        min-width: 28;
    }

    #preview-pane {
        width: 67%;
    }

    #chat-list {
        height: 1fr;
    }

    #chat-list > .option-list--option {
        margin-bottom: 1;
    }

    #preview-markdown {
        height: 1fr;
        border: round $panel;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header()
        chats = sorted(self.app.chats, key=lambda c: c.lastEdit, reverse=True)
        options = [Option(format_chat_list_row(chat), id=chat.chatId) for chat in chats]

        with Horizontal():
            with Vertical(id="list-pane"):
                yield OptionList(*options, id="chat-list")
            with Vertical(id="preview-pane"):
                yield Markdown(id="preview-markdown")

        yield Footer()

    def on_mount(self) -> None:
        option_list = self.query_one("#chat-list", OptionList)
        if option_list.options:
            option_list.highlighted = 0
            self._update_preview()

    def on_option_list_option_highlighted(
        self, _: OptionList.OptionHighlighted
    ) -> None:
        self._update_preview()

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        chat_id = event.option.id
        selected_chat = next((c for c in self.app.chats if c.chatId == chat_id), None)
        if selected_chat:
            self.app.current_chat = selected_chat
            self.app.push_screen("chat_view")

    def _selected_chat(self):
        option_list = self.query_one("#chat-list", OptionList)
        if option_list.highlighted is None:
            return None
        chat_id = option_list.get_option_at_index(option_list.highlighted).id
        return next((c for c in self.app.chats if c.chatId == chat_id), None)

    def _update_preview(self) -> None:
        selected = self._selected_chat()
        preview = render_chat_preview(selected) if selected else "_No chat selected_"
        self.query_one("#preview-markdown", Markdown).update(preview)

    def action_export(self) -> None:
        selected_chat = self._selected_chat()
        if selected_chat:
            self.app.current_chat = selected_chat
            self.app.push_screen("export_dialog")
