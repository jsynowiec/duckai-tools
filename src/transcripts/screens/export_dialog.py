import re
from pathlib import Path

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Input, Label, Select, Static

from transcripts.rendering import render_chat

FORMAT_OPTIONS = [
    ("Markdown", "md"),
    ("HTML", "html"),
]


def slugify(text: str) -> str:
    """Convert text to a filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:50]


class ExportDialogScreen(ModalScreen[None]):
    CSS = """
    ExportDialogScreen {
        align: center middle;
    }

    #export-dialog {
        width: 60;
        max-width: 90%;
        padding: 1 2;
        background: $surface;
        border: tall $primary;
    }

    #export-dialog Label {
        margin-top: 1;
    }

    #export-dialog Label:first-child {
        margin-top: 0;
    }

    #export-dialog Input {
        margin-bottom: 1;
    }

    #export-dialog Select {
        margin-bottom: 1;
    }

    #export-dialog Static {
        color: $text-muted;
    }
    """

    BINDINGS = [
        ("escape", "cancel", "Cancel"),
    ]

    def compose(self) -> ComposeResult:
        chat = self.app.current_chat
        title = chat.title if chat else "export"
        slug = slugify(title)

        with Vertical(id="export-dialog"):
            yield Label("Export Options")
            yield Label("Filename:")
            yield Input(value=f"{slug}.md", id="filename-input")
            yield Label("Format:")
            yield Select(
                FORMAT_OPTIONS,
                value="md",
                id="format-select",
                allow_blank=False,
            )
            yield Static("Press return to confirm, esc to cancel")

    def on_screen_resume(self) -> None:
        chat = self.app.current_chat
        title = chat.title if chat else "export"
        slug = slugify(title)
        self.query_one("#filename-input", Input).value = f"{slug}.md"

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == "filename-input":
            self._sync_extension()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self._do_export()

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id == "format-select" and event.value is not Select.BLANK:
            self._sync_extension()

    def _sync_extension(self) -> None:
        path_input = self.query_one("#filename-input", Input)
        fmt_select = self.query_one("#format-select", Select)
        ext = fmt_select.value
        if not ext or ext is Select.BLANK:
            return
        current = path_input.value
        stem = current.rsplit(".", 1)[0] if "." in current else current
        path_input.value = f"{stem}.{ext}"

    def _do_export(self) -> None:
        chat = self.app.current_chat
        if not chat:
            self.app.notify("No chat selected", severity="error")
            return

        path_input = self.query_one("#filename-input", Input)
        fmt_select = self.query_one("#format-select", Select)
        ext = fmt_select.value
        if not ext or ext is Select.BLANK:
            self.app.notify("Select a format", severity="warning")
            return

        output_path = Path(path_input.value)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        content = render_chat(chat, ext)
        output_path.write_text(content)

        self.app.notify(f"Exported to {output_path}")
        self.app.pop_screen()

    def action_cancel(self) -> None:
        self.app.pop_screen()
