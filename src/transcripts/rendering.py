from pathlib import Path
from typing import Literal

import chevron
import markdown as md_lib

from transcripts.models import Chat

TEMPLATE_DIR = Path(__file__).parent / "templates"
MD_EXTENSIONS = ["fenced_code", "tables", "sane_lists"]


def _md_to_html(text: str | None) -> str:
    if not text:
        return ""
    return md_lib.markdown(text, extensions=MD_EXTENSIONS)


def build_view_model(chat: Chat) -> dict:
    """Build a Mustache-compatible dict from a Chat model."""
    messages = []
    for msg in chat.messages:
        msg_dict = {
            "role": msg.role,
            "createdAt": msg.createdAt.isoformat(),
            "model": msg.model,
            "isUser": msg.role == "user",
            "isAssistant": msg.role == "assistant",
            "content": msg.content,
            "parts": [],
        }

        if msg.parts:
            for part in msg.parts:
                part_dict = {
                    "type": part.type,
                    "text": part.text,
                    "id": part.id,
                    "summaryText": part.summaryText,
                    "state": part.state,
                    "complete": part.complete,
                    "toolName": part.toolName,
                    "toolCallId": part.toolCallId,
                    "toolArguments": part.toolArguments,
                    "result": part.result,
                    "data": part.data,
                    "redacted": part.redacted,
                    "isText": part.type == "text",
                    "isReasoning": part.type == "reasoning",
                    "isToolInvocation": part.type == "tool-invocation",
                    "isSource": part.type == "source",
                }

                # Flatten source fields for Mustache
                if part.source:
                    part_dict["url"] = part.source.url
                    part_dict["title"] = part.source.title
                    part_dict["site"] = part.source.site

                # Copy reasoningDurationMs from message to reasoning parts
                if part.type == "reasoning" and msg.reasoningDurationMs is not None:
                    part_dict["reasoningDurationMs"] = msg.reasoningDurationMs

                msg_dict["parts"].append(part_dict)

        messages.append(msg_dict)

    # Build firstMessageCreatedAt
    first_msg_created = None
    if chat.messages:
        first_msg_created = chat.messages[0].createdAt.isoformat()

    return {
        "title": chat.title,
        "model": chat.model,
        "chatId": chat.chatId,
        "lastEdit": chat.lastEdit.isoformat(),
        "lastEditType": chat.lastEditType,
        "pinned": chat.pinned,
        "firstMessageCreatedAt": first_msg_created,
        "messageCount": len(chat.messages),
        "messages": messages,
    }


def _htmlify_view_model(view_model: dict) -> dict:
    """Convert markdown content to HTML for user and assistant text parts."""
    for msg in view_model["messages"]:
        if msg["isUser"]:
            msg["contentHtml"] = _md_to_html(msg.get("content"))
        if msg["isAssistant"]:
            for part in msg.get("parts", []):
                if part.get("isText"):
                    part["textHtml"] = _md_to_html(part.get("text"))
    return view_model


def render_chat(chat: Chat, fmt: Literal["md", "html"]) -> str:
    """Render a Chat model to markdown or html using Mustache templates."""
    template_path = TEMPLATE_DIR / f"template.{fmt}"
    template = template_path.read_text()
    view_model = build_view_model(chat)
    if fmt == "html":
        view_model = _htmlify_view_model(view_model)
    return chevron.render(template, view_model)
