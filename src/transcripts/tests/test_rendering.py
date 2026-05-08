import unittest

from transcripts.models import Chat
from transcripts.rendering import (
    _prefix_markdown_lines,
    build_view_model,
    render_chat,
)


def make_chat(payload: dict) -> Chat:
    return Chat.model_validate(payload)


class TestRenderingMetadata(unittest.TestCase):
    def test_metadata_rows_order_and_omission(self):
        chat = make_chat(
            {
                "title": "Readability",
                "model": "gpt-5",
                "messages": [],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:00:00Z",
                "pinned": False,
            }
        )
        view_model = build_view_model(chat)
        rows = view_model["metadataRows"]
        self.assertEqual(
            [row["key"] for row in rows],
            ["title", "model", "lastEdit", "messageCount", "pinned"],
        )
        self.assertEqual(rows[-1]["value"], "No")

    def test_metadata_rows_include_created_at_when_available(self):
        chat = make_chat(
            {
                "title": "Readability",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T09:00:00Z",
                        "content": "hello",
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:00:00Z",
                "pinned": True,
            }
        )
        rows = build_view_model(chat)["metadataRows"]
        self.assertEqual(
            [row["key"] for row in rows],
            ["title", "model", "createdAt", "lastEdit", "messageCount", "pinned"],
        )
        self.assertEqual(rows[-1]["value"], "Yes")

    def test_title_truncation_applied_to_view_model_and_metadata_title(self):
        title = "T" * 80
        chat = make_chat(
            {
                "title": title,
                "model": "gpt-5",
                "messages": [],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:00:00Z",
            }
        )
        view_model = build_view_model(chat)
        self.assertEqual(len(view_model["title"]), 60)
        title_row = next(row for row in view_model["metadataRows"] if row["key"] == "title")
        self.assertEqual(title_row["value"], view_model["title"])


class TestRenderingHelpers(unittest.TestCase):
    def test_prefix_markdown_lines_handles_paragraph_breaks(self):
        text = "line 1\n\nline 3"
        self.assertEqual(_prefix_markdown_lines(text, "> "), "> line 1\n> \n> line 3")


class TestRenderingTemplates(unittest.TestCase):
    def test_markdown_has_canonical_source_callout(self):
        chat = make_chat(
            {
                "title": "Callout Mapping",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "parts": [
                            {
                                "type": "source",
                                "source": {
                                    "url": "https://example.com",
                                    "title": "Example",
                                    "site": "example.com",
                                },
                            }
                        ],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:00:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertIn("[!quote] Source", output)
        self.assertNotIn("[!cite]", output)

    def test_markdown_uses_role_icons_and_nested_assistant_sections(self):
        chat = make_chat(
            {
                "title": "Hierarchy",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "content": "hello",
                    },
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "model": "gpt-5",
                        "parts": [
                            {"type": "text", "text": "answer"},
                            {"type": "reasoning", "summaryText": ["think"]},
                            {
                                "type": "tool-invocation",
                                "toolName": "search",
                                "toolArguments": "{\"q\":\"x\"}",
                                "result": "ok",
                            },
                        ],
                    },
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertIn("[!question] \uf007 User", output)
        self.assertIn("[!note] \U000f06a9 Agent", output)
        self.assertIn("> [!abstract] \U000f16a0 Reasoning", output)
        self.assertIn("> > [!info] \U000f16a0 Reasoning", output)
        self.assertIn("> > [!tip] \ueb6d Tool", output)
        self.assertNotIn("\n> [!info]", output)
        self.assertNotIn("\n> [!tip]", output)
        self.assertIn("> > think", output)
        self.assertNotIn("<details>", output)
        self.assertNotIn("<summary>", output)

    def test_assistant_trace_parts_are_chronological(self):
        chat = make_chat(
            {
                "title": "Chronology",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "parts": [
                            {"type": "tool-invocation", "toolName": "search"},
                            {"type": "reasoning", "summaryText": ["r1"]},
                            {
                                "type": "source",
                                "source": {
                                    "url": "https://example.com",
                                    "title": "Example",
                                    "site": "example.com",
                                },
                            },
                            {"type": "reasoning", "summaryText": ["r2"]},
                        ],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        vm = build_view_model(chat)
        parts = vm["messages"][0]["assistantTraceParts"]
        self.assertTrue(parts[0]["isToolInvocation"])
        self.assertTrue(parts[1]["isReasoning"])
        self.assertTrue(parts[2]["isSource"])
        self.assertTrue(parts[3]["isReasoning"])

    def test_markdown_omits_no_content_placeholders(self):
        chat = make_chat(
            {
                "title": "No Noise",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "parts": [{"type": "reasoning"}],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:00:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertNotIn("No content", output)

    def test_markdown_multiline_content_keeps_blockquote_structure(self):
        chat = make_chat(
            {
                "title": "Multiline",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "content": "para1\n\npara2",
                    },
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "parts": [{"type": "text", "text": "a\n\nb"}],
                    },
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertIn("> para1\n> \n> para2", output)
        self.assertIn("> a\n> \n> b", output)

    def test_html_has_assistant_nested_sections(self):
        chat = make_chat(
            {
                "title": "HTML Nesting",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:00:30Z",
                        "content": "q",
                    },
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "parts": [
                            {"type": "reasoning", "summaryText": ["think"]},
                            {"type": "tool-invocation", "toolName": "search"},
                        ],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "html")
        self.assertIn('class="message assistant-trace"', output)
        self.assertIn('class="assistant-nested"', output)
        self.assertIn('class="turn-extra reasoning"', output)
        self.assertIn("@import \"https://www.nerdfonts.com/assets/css/webfont.css\";", output)
        self.assertIn("nf-md-robot", output)
        self.assertIn("nf-fa-user", output)
        self.assertIn("nf-md-robot_confused_outline", output)
        self.assertIn("nf-cod-tools", output)

    def test_markdown_reasoning_is_always_expanded(self):
        chat = make_chat(
            {
                "title": "Always Expanded",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "parts": [{"type": "reasoning", "summaryText": ["think"]}],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertNotIn("Reasoning collapsed", output)
        self.assertNotIn("<details>", output)
        self.assertNotIn("<summary>", output)
        self.assertIn("> > think", output)

    def test_markdown_has_single_assistant_trace_group_wrapper(self):
        chat = make_chat(
            {
                "title": "Trace Group",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "parts": [
                            {"type": "reasoning", "summaryText": ["r1"]},
                            {"type": "tool-invocation", "toolName": "search"},
                            {"type": "reasoning", "summaryText": ["r2"]},
                        ],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertEqual(output.count("> [!abstract] \U000f16a0 Reasoning"), 1)

    def test_markdown_trace_group_ends_before_next_user_message(self):
        chat = make_chat(
            {
                "title": "Trace Boundary",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "parts": [
                            {"type": "reasoning", "summaryText": ["r1"]},
                            {
                                "type": "tool-invocation",
                                "toolName": "search",
                                "toolArguments": "{\"q\":\"x\"}",
                                "result": "ok",
                            },
                        ],
                    },
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "content": "next",
                    },
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertLess(output.index("> > Result: ok"), output.index("> [!question]"))
        self.assertIn("\n \n> [!question]", output)

    def test_markdown_assistant_text_ends_before_next_user_message(self):
        chat = make_chat(
            {
                "title": "Assistant/User Boundary",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:00:00Z",
                        "parts": [{"type": "text", "text": "agent reply"}],
                    },
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "content": "next user",
                    },
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "md")
        self.assertIn("> agent reply\n \n> [!question]", output)

    def test_html_has_single_assistant_trace_details_wrapper(self):
        chat = make_chat(
            {
                "title": "Single Details",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "assistant",
                        "createdAt": "2026-05-08T10:01:00Z",
                        "parts": [
                            {"type": "reasoning", "summaryText": ["r1"]},
                            {"type": "tool-invocation", "toolName": "search"},
                            {
                                "type": "source",
                                "source": {
                                    "url": "https://example.com",
                                    "title": "Example",
                                    "site": "example.com",
                                },
                            },
                            {"type": "reasoning", "summaryText": ["r2"]},
                        ],
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "html")
        self.assertEqual(output.count("<details>"), 1)
        self.assertIn("nf-md-robot_confused_outline", output)
        self.assertIn(">Reasoning</strong></summary>", output)
        self.assertLess(output.index('class="turn-extra reasoning"'), output.index('class="turn-extra tool-call"'))
        self.assertLess(output.index('class="turn-extra tool-call"'), output.index('class="turn-extra source"'))

    def test_html_styles_message_tables_without_changing_metadata_table_class(self):
        chat = make_chat(
            {
                "title": "HTML Tables",
                "model": "gpt-5",
                "messages": [
                    {
                        "role": "user",
                        "createdAt": "2026-05-08T10:00:30Z",
                        "content": "| A | B |\n| --- | --- |\n| 1 | 2 |",
                    }
                ],
                "chatId": "c1",
                "lastEdit": "2026-05-08T10:02:00Z",
            }
        )
        output = render_chat(chat, "html")
        self.assertIn(".message .content table", output)
        self.assertIn('class="meta-table"', output)


if __name__ == "__main__":
    unittest.main()
