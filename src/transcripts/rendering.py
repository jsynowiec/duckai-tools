from pathlib import Path
from typing import Literal

import chevron
import markdown as md_lib

from transcripts.models import Chat
from transcripts.ui_helpers import truncate_title

TEMPLATE_DIR = Path(__file__).parent / "templates"
MD_EXTENSIONS = ["fenced_code", "tables", "sane_lists"]


def _md_to_html(text: str | None) -> str:
    if not text:
        return ""
    return md_lib.markdown(text, extensions=MD_EXTENSIONS)


def _stringify_value(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, int):
        return str(value)
    text = str(value).strip()
    return text or None


def _prefix_markdown_lines(text: str | list[str] | None, prefix: str) -> str:
    if text is None:
        return ""
    if isinstance(text, list):
        text = "\n".join(text)
    return "\n".join(f"{prefix}{line}" for line in text.splitlines())


def _build_callout_title(icon: str, label: str, suffix: str | None = None) -> str:
    if suffix:
        return f"{icon} {label} · {suffix}"
    return f"{icon} {label}"


def _build_metadata_rows(chat: Chat, first_msg_created: str | None) -> list[dict[str, str]]:
    title = truncate_title(chat.title)
    raw_rows = [
        ("title", title),
        ("model", chat.model),
        ("createdAt", first_msg_created),
        ("lastEdit", chat.lastEdit.isoformat()),
        ("messageCount", len(chat.messages)),
        ("pinned", chat.pinned),
    ]
    rows: list[dict[str, str]] = []
    for key, value in raw_rows:
        text = _stringify_value(value)
        if text is None:
            continue
        rows.append({"key": key, "value": text})
    return rows


def _build_part_trace(part: object, reasoning_duration_ms: int | None) -> dict:
    if part.type == "reasoning":
        suffix = f"{reasoning_duration_ms}ms" if reasoning_duration_ms is not None else None
        summary_lines = part.summaryText or []
        summary_text = "\n".join(summary_lines).strip()
        return {
            "isReasoning": True,
            "isToolInvocation": False,
            "isSource": False,
            "calloutTitle": _build_callout_title("󱚠", "Reasoning", suffix),
            "htmlIconClass": "nf-md-robot_confused_outline",
            "htmlLabel": "Reasoning",
            "reasoningSummaryText": summary_text,
            "hasReasoningSummaryText": bool(summary_text),
            "reasoningBodyBlockquote": _prefix_markdown_lines(part.summaryText, "> > "),
        }

    if part.type == "tool-invocation":
        return {
            "isReasoning": False,
            "isToolInvocation": True,
            "isSource": False,
            "calloutTitle": _build_callout_title(
                "", "Tool", f"`{part.toolName}`" if part.toolName else None
            ),
            "htmlIconClass": "nf-cod-tools",
            "htmlLabel": "Tool",
            "toolName": part.toolName,
            "toolArguments": part.toolArguments,
            "result": part.result,
            "hasResult": bool(part.result and part.result.strip()),
            "toolArgumentsBlockquote": _prefix_markdown_lines(
                f"Arguments: `{part.toolArguments}`" if part.toolArguments else None,
                "> > ",
            ),
            "resultBlockquote": _prefix_markdown_lines(
                f"Result: {part.result}" if part.result else None, "> > "
            ),
        }

    source = part.source
    source_title = source.title if source else ""
    source_url = source.url if source else ""
    source_site = source.site if source else ""
    return {
        "isReasoning": False,
        "isToolInvocation": False,
        "isSource": True,
        "calloutTitle": _build_callout_title("", "Tool", "Source"),
        "sourceUrl": source_url,
        "sourceTitle": source_title,
        "sourceSite": source_site,
        "hasSourceSite": bool(source and source.site),
        "sourceCalloutTitle": _build_callout_title(
            "", "Tool", f"[{source_title}]({source_url})"
        ),
        "siteBlockquote": _prefix_markdown_lines(source_site, "> > "),
    }


def _build_assistant_trace_group_markdown(assistant_trace_parts: list[dict]) -> str:
    lines: list[str] = [f"> [!abstract] {_build_callout_title('󱚠', 'Reasoning')}"]

    for trace in assistant_trace_parts:
        if trace.get("isReasoning"):
            lines.append(f"> > [!info] {trace['calloutTitle']}")
            body = trace.get("reasoningSummaryText")
            if body:
                lines.extend(_prefix_markdown_lines(body, "> > ").splitlines())
            continue

        if trace.get("isToolInvocation"):
            lines.append(f"> > [!tip] {trace['calloutTitle']}")
            tool_args = trace.get("toolArguments")
            if tool_args:
                lines.extend(
                    _prefix_markdown_lines(f"Arguments: `{tool_args}`", "> > ").splitlines()
                )
            result = trace.get("result")
            if result:
                lines.extend(_prefix_markdown_lines(f"Result: {result}", "> > ").splitlines())
            continue

        if trace.get("isSource"):
            lines.append("> > [!quote] Source")
            lines.append(f"> > Source: [{trace['sourceTitle']}]({trace['sourceUrl']})")
            site = trace.get("sourceSite")
            if site:
                lines.extend(_prefix_markdown_lines(site, "> > ").splitlines())

    # Ensure the grouped trace block cleanly terminates before the next message blockquote.
    return "\n".join(lines) + "\n"


def build_view_model(chat: Chat) -> dict:
    """Build a Mustache-compatible dict from a Chat model."""
    title = truncate_title(chat.title)
    messages = []
    for msg in chat.messages:
        text_parts = [p for p in (msg.parts or []) if p.type == "text" and p.text]

        is_assistant = msg.role == "assistant"
        msg_dict = {
            "role": msg.role,
            "createdAt": msg.createdAt.isoformat(),
            "model": msg.model,
            "isUser": msg.role == "user",
            "isAssistant": is_assistant,
            "content": msg.content,
            "hasContent": bool((msg.content or "").strip()),
            "contentBlockquote": _prefix_markdown_lines(msg.content, "> "),
            "userCalloutTitle": _build_callout_title("", "User", msg.createdAt.isoformat()),
            "assistantCalloutTitle": _build_callout_title(
                "󰚩",
                "Agent",
                " · ".join([item for item in [msg.model, msg.createdAt.isoformat()] if item]),
            ),
            "userIconClass": "nf-fa-user",
            "assistantIconClass": "nf-md-robot",
            "textParts": [],
            "assistantTraceParts": [],
            "assistantTraceGroupBlockquote": "",
        }
        for part in text_parts:
            msg_dict["textParts"].append(
                {
                    "text": part.text,
                    "textBlockquote": _prefix_markdown_lines(part.text, "> "),
                }
            )

        if msg.parts:
            for part in msg.parts:
                if part.type in {"reasoning", "tool-invocation", "source"}:
                    trace = _build_part_trace(part, msg.reasoningDurationMs)
                    msg_dict["assistantTraceParts"].append(trace)

        msg_dict["hasTextParts"] = bool(msg_dict["textParts"])
        msg_dict["hasAssistantTraceParts"] = bool(msg_dict["assistantTraceParts"])
        if msg_dict["hasAssistantTraceParts"]:
            msg_dict["assistantTraceGroupBlockquote"] = _build_assistant_trace_group_markdown(
                msg_dict["assistantTraceParts"]
            )
        messages.append(msg_dict)

    first_msg_created = chat.messages[0].createdAt.isoformat() if chat.messages else None
    metadata_rows = _build_metadata_rows(chat, first_msg_created)

    return {
        "title": title,
        "model": chat.model,
        "chatId": chat.chatId,
        "lastEdit": chat.lastEdit.isoformat(),
        "lastEditType": chat.lastEditType,
        "pinned": chat.pinned,
        "firstMessageCreatedAt": first_msg_created,
        "messageCount": len(chat.messages),
        "metadataRows": metadata_rows,
        "hasMetadataRows": bool(metadata_rows),
        "messages": messages,
    }


def _htmlify_view_model(view_model: dict) -> dict:
    """Convert markdown content to HTML for user and assistant text parts."""
    for msg in view_model["messages"]:
        if msg["isUser"]:
            msg["contentHtml"] = _md_to_html(msg.get("content"))
        if msg["isAssistant"]:
            for part in msg.get("textParts", []):
                part["textHtml"] = _md_to_html(part.get("text"))
            for trace in msg.get("assistantTraceParts", []):
                if trace.get("isReasoning"):
                    trace["reasoningBodyHtml"] = _md_to_html(trace.get("reasoningSummaryText"))
    return view_model


def render_chat(
    chat: Chat,
    fmt: Literal["md", "html"],
) -> str:
    """Render a Chat model to markdown or html using Mustache templates."""
    template_path = TEMPLATE_DIR / f"template.{fmt}"
    template = template_path.read_text()
    view_model = build_view_model(chat)
    if fmt == "html":
        view_model = _htmlify_view_model(view_model)
    return chevron.render(template, view_model)
