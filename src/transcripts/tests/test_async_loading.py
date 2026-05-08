import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from transcripts.app import TranscriptsApp, load_chats_from_export
from transcripts.screens.chat_view import ChatViewScreen


class _FakeWidget:
    def __init__(self, display: bool = True):
        self.display = display


class _FakeMarkdown(_FakeWidget):
    def __init__(self, display: bool = False):
        super().__init__(display=display)
        self.updated_with = None

    def update(self, value: str) -> None:
        self.updated_with = value


class _FakeScroller:
    def __init__(self):
        self.scroll_home = Mock()


class TestTranscriptsAppAsyncLoading(unittest.IsolatedAsyncioTestCase):
    async def test_load_chats_uses_to_thread_and_navigates_on_success(self):
        app = SimpleNamespace(
            export_path=Path("/tmp/export.json"),
            chats=[],
            notify=Mock(),
            exit=Mock(),
            pop_screen=Mock(),
            push_screen=Mock(),
        )
        expected = [SimpleNamespace(chatId="c1")]

        with patch("transcripts.app.asyncio.to_thread", new=AsyncMock(return_value=expected)) as to_thread:
            await TranscriptsApp._load_chats_async.__wrapped__(app)

        to_thread.assert_awaited_once_with(load_chats_from_export, app.export_path)
        self.assertEqual(app.chats, expected)
        app.pop_screen.assert_called_once_with()
        app.push_screen.assert_called_once_with("chat_list")
        app.notify.assert_not_called()
        app.exit.assert_not_called()

    async def test_load_chats_error_path_unchanged(self):
        app = SimpleNamespace(
            export_path=Path("/tmp/bad-export.json"),
            chats=[],
            notify=Mock(),
            exit=Mock(),
            pop_screen=Mock(),
            push_screen=Mock(),
        )

        with patch(
            "transcripts.app.asyncio.to_thread",
            new=AsyncMock(side_effect=ValueError("boom")),
        ):
            await TranscriptsApp._load_chats_async.__wrapped__(app)

        app.notify.assert_called_once()
        message = app.notify.call_args.args[0]
        self.assertIn("Failed to load export", message)
        self.assertIn("boom", message)
        self.assertEqual(app.notify.call_args.kwargs.get("severity"), "error")
        app.exit.assert_called_once_with()
        app.pop_screen.assert_not_called()
        app.push_screen.assert_not_called()

    async def test_load_chats_empty_path_unchanged(self):
        app = SimpleNamespace(
            export_path=Path("/tmp/empty-export.json"),
            chats=[],
            notify=Mock(),
            exit=Mock(),
            pop_screen=Mock(),
            push_screen=Mock(),
        )

        with patch("transcripts.app.asyncio.to_thread", new=AsyncMock(return_value=[])):
            await TranscriptsApp._load_chats_async.__wrapped__(app)

        app.notify.assert_called_once_with("No chats found in export file", severity="error")
        app.exit.assert_called_once_with()
        app.pop_screen.assert_not_called()
        app.push_screen.assert_not_called()


class TestChatViewAsyncLoading(unittest.IsolatedAsyncioTestCase):
    async def test_current_chat_render_is_offloaded_and_loading_states_transition(self):
        chat = SimpleNamespace(chatId="c1")
        label = _FakeWidget(display=True)
        spinner = _FakeWidget(display=True)
        markdown = _FakeMarkdown(display=False)
        scroller = _FakeScroller()

        screen = SimpleNamespace(
            app=SimpleNamespace(current_chat=chat),
            query_one=Mock(),
        )

        mapping = {
            "#chat-loading-label": label,
            "#chat-loading": spinner,
            "#markdown-preview": markdown,
            "#view-scroller": scroller,
        }
        screen.query_one.side_effect = lambda selector, _type: mapping[selector]

        async def fake_to_thread(fn, arg_chat, fmt):
            self.assertTrue(label.display)
            self.assertTrue(spinner.display)
            self.assertFalse(markdown.display)
            self.assertIs(arg_chat, chat)
            self.assertEqual(fmt, "md")
            return "rendered markdown"

        with patch("transcripts.screens.chat_view.asyncio.to_thread", new=AsyncMock(side_effect=fake_to_thread)) as to_thread:
            await ChatViewScreen._load_current_chat.__wrapped__(screen)

        to_thread.assert_awaited_once()
        self.assertFalse(label.display)
        self.assertFalse(spinner.display)
        self.assertTrue(markdown.display)
        self.assertEqual(markdown.updated_with, "rendered markdown")
        scroller.scroll_home.assert_called_once_with(animate=False)

    async def test_no_chat_selected_uses_fallback_without_to_thread(self):
        label = _FakeWidget(display=True)
        spinner = _FakeWidget(display=True)
        markdown = _FakeMarkdown(display=False)
        scroller = _FakeScroller()

        screen = SimpleNamespace(
            app=SimpleNamespace(current_chat=None),
            query_one=Mock(),
        )

        mapping = {
            "#chat-loading-label": label,
            "#chat-loading": spinner,
            "#markdown-preview": markdown,
            "#view-scroller": scroller,
        }
        screen.query_one.side_effect = lambda selector, _type: mapping[selector]

        with patch("transcripts.screens.chat_view.asyncio.to_thread", new=AsyncMock()) as to_thread:
            await ChatViewScreen._load_current_chat.__wrapped__(screen)

        to_thread.assert_not_awaited()
        self.assertEqual(markdown.updated_with, "*No chat selected*")
        self.assertFalse(label.display)
        self.assertFalse(spinner.display)
        self.assertTrue(markdown.display)
        scroller.scroll_home.assert_called_once_with(animate=False)


if __name__ == "__main__":
    unittest.main()
