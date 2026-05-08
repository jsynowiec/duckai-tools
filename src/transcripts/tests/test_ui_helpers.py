import unittest
from io import StringIO

from rich.console import Console

from transcripts.models import Chat
from transcripts.ui_helpers import (
    format_chat_list_row,
    parse_callout_blockquote,
    render_chat_preview,
    truncate_title,
)


def make_chat(title: str, messages: list[dict]) -> Chat:
    return Chat.model_validate(
        {
            "title": title,
            "model": "gpt",
            "messages": messages,
            "chatId": "c1",
            "lastEdit": "2026-05-08T10:00:00Z",
        }
    )


class TestFormatters(unittest.TestCase):
    def test_title_truncation_60_chars(self):
        title = "x" * 61
        self.assertEqual(len(truncate_title(title)), 60)
        self.assertTrue(truncate_title(title).endswith("..."))

    def test_list_row_has_metadata_line_and_title_line(self):
        chat = make_chat(
            "Title",
            [{"role": "user", "createdAt": "2026-05-08T10:00:00Z", "content": "hi"}],
        )
        console = Console(record=True, width=50, file=StringIO())
        console.print(format_chat_list_row(chat))
        lines = [line.rstrip() for line in console.export_text().splitlines() if line.strip()]
        self.assertGreaterEqual(len(lines), 2)
        self.assertIn("2026-05-08 10:00", lines[0])
        self.assertTrue(lines[0].endswith("1 msgs"))
        self.assertEqual(lines[1], "Title")


class TestPreview(unittest.TestCase):
    def test_preview_first_user_and_first_assistant(self):
        chat = make_chat(
            "Preview",
            [
                {"role": "user", "createdAt": "2026-05-08T10:00:00Z", "content": "u1"},
                {
                    "role": "assistant",
                    "createdAt": "2026-05-08T10:01:00Z",
                    "parts": [{"type": "text", "text": "a1"}],
                },
                {"role": "user", "createdAt": "2026-05-08T10:02:00Z", "content": "u2"},
            ],
        )
        preview = render_chat_preview(chat)
        self.assertIn("## User", preview)
        self.assertIn("u1", preview)
        self.assertIn("## Assistant", preview)
        self.assertIn("a1", preview)
        self.assertNotIn("u2", preview)

    def test_preview_missing_pair(self):
        chat = make_chat(
            "Only user",
            [{"role": "user", "createdAt": "2026-05-08T10:00:00Z", "content": "u1"}],
        )
        preview = render_chat_preview(chat)
        self.assertIn("u1", preview)
        self.assertNotIn("## Assistant", preview)


class TestCallouts(unittest.TestCase):
    def test_parse_canonical_with_title(self):
        parsed = parse_callout_blockquote("> [!tip] Quick\n> line one\n> line two")
        assert parsed is not None
        self.assertEqual(parsed.callout_type, "tip")
        self.assertEqual(parsed.title, "Quick")
        self.assertEqual(parsed.body, "line one\nline two")

    def test_parse_alias_mapping(self):
        parsed = parse_callout_blockquote("> [!caution]\n> body")
        assert parsed is not None
        self.assertEqual(parsed.callout_type, "warning")

    def test_malformed_falls_back_none(self):
        self.assertIsNone(parse_callout_blockquote("> not a callout\n> body"))

    def test_unknown_maps_to_note(self):
        parsed = parse_callout_blockquote("> [!something]\n> body")
        assert parsed is not None
        self.assertEqual(parsed.callout_type, "note")


if __name__ == "__main__":
    unittest.main()
