from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Footer, Header, OptionList
from textual.widgets.option_list import Option


class ChatListScreen(Screen):
    BINDINGS = [
        ("e", "export", "Export"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        chats = sorted(self.app.chats, key=lambda c: c.lastEdit, reverse=True)
        options = []
        for chat in chats:
            label = f"{chat.lastEdit.strftime('%Y-%m-%d %H:%M')} │ {chat.title} ({len(chat.messages)} msgs)"
            option = Option(label, id=chat.chatId)
            options.append(option)
        yield OptionList(*options, id="chat-list")
        yield Footer()

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        chat_id = event.option.id
        selected_chat = next((c for c in self.app.chats if c.chatId == chat_id), None)
        if selected_chat:
            self.app.current_chat = selected_chat
            self.app.push_screen("chat_view")

    def action_export(self) -> None:
        option_list = self.query_one("#chat-list", OptionList)
        if option_list.highlighted is not None:
            chat_id = option_list.get_option_at_index(option_list.highlighted).id
            selected_chat = next(
                (c for c in self.app.chats if c.chatId == chat_id), None
            )
            if selected_chat:
                self.app.current_chat = selected_chat
                self.app.push_screen("export_dialog")
