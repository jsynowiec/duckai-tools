from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class SourceRef(BaseModel):
    url: str
    title: str
    site: str


class MessagePart(BaseModel):
    type: Literal["text", "reasoning", "tool-invocation", "source"]
    text: str | None = None
    id: str | None = None
    summaryText: list[str] | None = None
    state: str | None = None
    complete: bool | None = None
    toolName: str | None = None
    toolCallId: str | None = None
    toolArguments: str | None = None
    result: str | None = None
    data: dict | None = None
    source: SourceRef | None = None
    redacted: bool | None = None

    model_config = ConfigDict(extra="ignore")


class Message(BaseModel):
    role: Literal["user", "assistant"]
    createdAt: datetime
    content: str | None = None
    parts: list[MessagePart] | None = None
    model: str | None = None
    messageId: str | None = None
    reasoningDurationMs: int | None = None

    model_config = ConfigDict(extra="ignore")


class Chat(BaseModel):
    title: str
    model: str
    messages: list[Message]
    chatId: str
    lastEdit: datetime
    lastEditType: str = ""
    pinned: bool = False
    pendingSync: bool | None = None
    metadata: dict | None = None

    model_config = ConfigDict(extra="ignore")
