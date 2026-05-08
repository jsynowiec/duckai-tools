from __future__ import annotations

from dataclasses import dataclass
import re

from rich.console import Group, RenderableType
from rich.table import Table
from rich.text import Text

from transcripts.models import Chat

_TITLE_LIMIT = 60
_ELLIPSIS = "..."

_CALLOUT_ALIASES = {
    "summary": "abstract",
    "tldr": "abstract",
    "todo": "tip",
    "hint": "tip",
    "important": "warning",
    "caution": "warning",
    "attention": "warning",
    "error": "failure",
    "fail": "failure",
    "missing": "failure",
    "check": "question",
    "help": "question",
    "faq": "question",
}

_CANONICAL_CALLOUT_TYPES = {
    "note",
    "abstract",
    "info",
    "tip",
    "success",
    "question",
    "warning",
    "failure",
    "danger",
    "bug",
    "example",
    "quote",
}

_CALLOUT_HEADER_RE = re.compile(r"^\[!([a-zA-Z0-9_-]+)\](?:\s+(.*))?$")


@dataclass(frozen=True)
class ParsedCallout:
    callout_type: str
    title: str | None
    body: str


def truncate_title(title: str, limit: int = _TITLE_LIMIT) -> str:
    if len(title) <= limit:
        return title
    return title[: limit - len(_ELLIPSIS)] + _ELLIPSIS


def format_chat_list_label(chat: Chat) -> str:
    ts = chat.lastEdit.strftime("%Y-%m-%d %H:%M")
    title = truncate_title(chat.title)
    metadata = f"{len(chat.messages)} msgs"
    return f"{ts}\n{title}\n{metadata}"


def format_chat_list_row(chat: Chat) -> RenderableType:
    ts = chat.lastEdit.strftime("%Y-%m-%d %H:%M")
    title = truncate_title(chat.title)
    metadata = f"{len(chat.messages)} msgs"

    meta = Table.grid(expand=True)
    meta.add_column(justify="left")
    meta.add_column(justify="right")
    meta.add_row(
        Text(ts, style="dim"),
        Text(metadata, style="dim"),
    )

    return Group(meta, Text(title))


def _assistant_text(chat: Chat) -> str | None:
    for msg in chat.messages:
        if msg.role != "assistant":
            continue
        if msg.parts:
            for part in msg.parts:
                if part.type == "text" and part.text:
                    return part.text
        if msg.content:
            return msg.content
    return None


def render_chat_preview(chat: Chat) -> str:
    first_user = next((m for m in chat.messages if m.role == "user" and m.content), None)
    assistant = _assistant_text(chat)

    chunks: list[str] = [f"# {truncate_title(chat.title)}"]
    if first_user:
        chunks.extend(["", "## User", first_user.content or ""])
    if assistant:
        chunks.extend(["", "## Assistant", assistant])
    if not first_user and not assistant:
        chunks.extend(["", "_No preview content available._"])
    return "\n".join(chunks)


def parse_callout_blockquote(source: str) -> ParsedCallout | None:
    lines = source.splitlines()
    quote_lines: list[str] = []
    for raw in lines:
        stripped = raw.lstrip()
        if not stripped.startswith(">"):
            return None
        body = stripped[1:]
        if body.startswith(" "):
            body = body[1:]
        quote_lines.append(body)

    if not quote_lines:
        return None

    header_match = _CALLOUT_HEADER_RE.match(quote_lines[0].strip())
    if not header_match:
        return None

    callout_raw = header_match.group(1).lower()
    title = header_match.group(2).strip() if header_match.group(2) else None

    canonical = _CALLOUT_ALIASES.get(callout_raw, callout_raw)
    if canonical not in _CANONICAL_CALLOUT_TYPES:
        canonical = "note"

    body = "\n".join(quote_lines[1:]).strip()
    return ParsedCallout(callout_type=canonical, title=title, body=body)
