from __future__ import annotations

from textual.app import ComposeResult
from textual.widgets import Markdown, Static
from textual.widgets._markdown import MarkdownBlockQuote

from transcripts.ui_helpers import parse_callout_blockquote


class CalloutMarkdownBlockQuote(MarkdownBlockQuote):
    DEFAULT_CSS = """
    CalloutMarkdownBlockQuote.callout-panel {
        border: round $panel;
        margin: 1 0;
        padding: 0 1;
        background: $boost;
    }

    CalloutMarkdownBlockQuote > .callout-header {
        text-style: bold;
        margin-bottom: 1;
    }

    CalloutMarkdownBlockQuote.callout-note > .callout-header { color: $text-primary; }
    CalloutMarkdownBlockQuote.callout-abstract > .callout-header { color: $text-muted; }
    CalloutMarkdownBlockQuote.callout-info > .callout-header { color: $text-accent; }
    CalloutMarkdownBlockQuote.callout-tip > .callout-header { color: $text-success; }
    CalloutMarkdownBlockQuote.callout-success > .callout-header { color: $text-success; }
    CalloutMarkdownBlockQuote.callout-question > .callout-header { color: $text-warning; }
    CalloutMarkdownBlockQuote.callout-warning > .callout-header { color: $text-warning; }
    CalloutMarkdownBlockQuote.callout-failure > .callout-header { color: $text-error; }
    CalloutMarkdownBlockQuote.callout-danger > .callout-header { color: $error; }
    CalloutMarkdownBlockQuote.callout-bug > .callout-header { color: $error; }
    CalloutMarkdownBlockQuote.callout-example > .callout-header { color: $text-primary; }
    CalloutMarkdownBlockQuote.callout-quote > .callout-header { color: $text-muted; }

    CalloutMarkdownBlockQuote > .callout-body {
        margin-left: 0;
        margin-top: 0;
    }
    """

    def compose(self) -> ComposeResult:
        parsed = parse_callout_blockquote(self.source or "")
        if parsed is None:
            yield from self._blocks
            self._blocks.clear()
            return

        self.add_class("callout-panel")
        self.add_class(f"callout-{parsed.callout_type}")
        header = parsed.title or parsed.callout_type.upper()
        yield Static(header, classes="callout-header")
        if parsed.body:
            yield Markdown(parsed.body, classes="callout-body")


class TranscriptMarkdown(Markdown):
    BLOCKS = dict(Markdown.BLOCKS)
    BLOCKS["blockquote_open"] = CalloutMarkdownBlockQuote
