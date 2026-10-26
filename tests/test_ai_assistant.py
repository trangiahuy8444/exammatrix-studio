"""
Unit tests for ai_assistant.py
Uses mock HTTP layer (unittest.mock.patch) to test parser, prompt generation, and strict schema validation.
NOTE: These tests do NOT call live Gemini APIs and do NOT represent verification of live network connectivity.
"""
import io
import json
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

from ai_assistant import (
    generate_questions_by_outcome,
    parse_raw_exam_text,
    generate_question_variants,
    validate_and_sanitize_question,
    AiValidationError,
    _clean_json_text,
    _sanitize_error_message,
    call_gemini,
    MAX_RAW_TEXT_LENGTH
)


def _make_mock_response(content_dict_or_list):
    """Creates a mock HTTP response simulating Google Gemini API JSON."""
    raw_text = json.dumps(content_dict_or_list, ensure_ascii=False)
    resp_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": raw_text}]
                }
            }
        ]
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(resp_payload).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    return mock_resp


class TestAiAssistant(unittest.TestCase):
    def setUp(self):
        import os, ai_assistant
        patcher = patch.dict(os.environ, {"GEMINI_API_KEY": "dummy_key_for_mock_test"})
        patcher.start(); self.addCleanup(patcher.stop)
        ai_assistant.reset_usage()

    def test_json_cleaner(self):
        raw = "```json\n{\"key\": \"val\"}\n```"
        self.assertEqual(_clean_json_text(raw), '{"key": "val"}')

        raw2 = "```\n[1, 2, 3]\n```"
        self.assertEqual(_clean_json_text(raw2), '[1, 2, 3]')

    def test_missing_api_key_raises_error(self):
        import os
        old = os.environ.get("GEMINI_API_KEY")
        if "GEMINI_API_KEY" in os.environ:
            del os.environ["GEMINI_API_KEY"]
        try:
            with self.assertRaises(ValueError) as ctx:
                generate_questions_by_outcome(10, "Tin học", "Bài 1", "YCCĐ 1")
            self.assertIn("chưa được cấu hình", str(ctx.exception))
        finally:
            if old is not None:
                os.environ["GEMINI_API_KEY"] = old

    def test_api_key_sanitization_in_errors(self):
        msg = "Error connecting to https://api.google.com?key=AIzaSySecret1234567890abcdefghijklmn: 403 Forbidden"
        cleaned = _sanitize_error_message(msg)
        self.assertNotIn("AIzaSySecret1234567890abcdefghijklmn", cleaned)
        self.assertIn("[REDACTED", cleaned)

    @patch("urllib.request.urlopen")
    def test_mode_1_generate_by_outcome_with_mocked_http(self, mock_urlopen):
        mock_data = [
            {
                "type": "MC",
                "question": "Thiết bị nào sau đây là thiết bị vào?",
                "options": ["Bàn phím", "Màn hình", "Máy in", "Loa"],
                "correct": 0,
                "option_explanations": ["Bàn phím là thiết bị vào", "Màn hình ra", "Máy in ra", "Loa ra"],
                "level": "Biết",
                "learning_outcome": "Nhận biết thiết bị vào"
            }
        ]
        mock_urlopen.return_value = _make_mock_response(mock_data)

        res = generate_questions_by_outcome(
            grade=8,
            subject="Tin học",
            lesson_name="Lược sử công cụ tính toán",
            learning_outcome="Nhận biết thiết bị vào",
            level="Biết",
            count=1
        )
        self.assertIsInstance(res, list)
        self.assertEqual(len(res), 1)
        q = res[0]
        self.assertEqual(q.get("type"), "MC")
        self.assertEqual(len(q["options"]), 4)
        self.assertEqual(q.get("correct"), 0)

    @patch("urllib.request.urlopen")
    def test_mode_2_parse_raw_exam_text_with_mocked_http(self, mock_urlopen):
        mock_data = [
            {
                "type": "MC",
                "question": "Câu hỏi bóc tách từ văn bản thô?",
                "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
                "correct": 1,
                "level": "Hiểu"
            }
        ]
        mock_urlopen.return_value = _make_mock_response(mock_data)

        raw_text = "Câu 1: Câu hỏi bóc tách từ văn bản thô?\nA. Phương án A\nB. Phương án B\nC. Phương án C\nD. Phương án D\nĐáp án: B"
        res = parse_raw_exam_text(raw_text, grade=10, subject="Tin học")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["correct"], 1)

    @patch("urllib.request.urlopen")
    def test_mode_3_generate_question_variants_with_mocked_http(self, mock_urlopen):
        mock_data = [
            {
                "type": "MC",
                "question": "Tính $x + y$ với $x=10, y=20$",
                "options": ["10", "20", "30", "40"],
                "correct": 2,
                "level": "Biết"
            }
        ]
        mock_urlopen.return_value = _make_mock_response(mock_data)

        orig_q = {
            "type": "MC",
            "question": "Tính $x + y$ với $x=1, y=2$",
            "options": ["1", "2", "3", "4"],
            "correct": 2,
            "level": "Biết"
        }
        res = generate_question_variants(orig_q, count=1)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["correct"], 2)

    def test_strict_schema_validation_rejects_missing_or_invalid_options(self):
        # Options count not 4
        bad_q1 = {
            "type": "MC",
            "question": "Câu hỏi trắc nghiệm thiếu lựa chọn",
            "options": ["A", "B", "C"],
            "correct": 0
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_q1)
        self.assertIn("phải có đúng 4 phương án", str(ctx.exception))

        # Empty option string
        bad_q2 = {
            "type": "MC",
            "question": "Câu hỏi trắc nghiệm có phương án rỗng",
            "options": ["A", "B", "", "D"],
            "correct": 0
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_q2)
        self.assertIn("Không được để trống", str(ctx.exception))

    def test_strict_schema_validation_rejects_missing_or_invalid_correct_answer(self):
        # Missing correct answer: Must raise error, NEVER fabricate default 0!
        bad_q1 = {
            "type": "MC",
            "question": "Câu hỏi thiếu đáp án đúng",
            "options": ["A", "B", "C", "D"]
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_q1)
        self.assertIn("thiếu trường đáp án đúng", str(ctx.exception))

        # Out-of-bounds correct answer
        bad_q2 = {
            "type": "MC",
            "question": "Câu hỏi đáp án sai chỉ số",
            "options": ["A", "B", "C", "D"],
            "correct": 4
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_q2)
        self.assertIn("phải từ 0 đến 3", str(ctx.exception))

    def test_strict_schema_validation_yn(self):
        # YN missing 4 statements
        bad_yn1 = {
            "type": "YN",
            "question": "Ngữ cảnh",
            "statements": [
                {"label": "a", "text": "Ý a", "correct": True}
            ]
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_yn1)
        self.assertIn("phải có đúng 4 nhận định", str(ctx.exception))

        # YN statement missing boolean correct
        bad_yn2 = {
            "type": "YN",
            "question": "Ngữ cảnh",
            "statements": [
                {"label": "a", "text": "Ý a", "correct": True},
                {"label": "b", "text": "Ý b", "correct": "maybe"},
                {"label": "c", "text": "Ý c", "correct": False},
                {"label": "d", "text": "Ý d", "correct": True}
            ]
        }
        with self.assertRaises(AiValidationError) as ctx:
            validate_and_sanitize_question(bad_yn2)
        self.assertIn("thiếu hoặc sai giá trị Đúng/Sai", str(ctx.exception))

    def test_raw_text_length_limit(self):
        huge_text = "A" * (MAX_RAW_TEXT_LENGTH + 10)
        with self.assertRaises(ValueError) as ctx:
            parse_raw_exam_text(huge_text)
        self.assertIn("vượt quá giới hạn tối đa", str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
