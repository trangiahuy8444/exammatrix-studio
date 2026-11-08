"""Bảo mật đáp án (mốc B2): xóa mọi trường đáp án khỏi dữ liệu gửi cho tài khoản không có quyền xem đáp án."""

ANSWER_KEYS = frozenset({'correct', 'option_explanations', 'rubric', 'short_answer', 'correct_answer', 'answer',
                         'sample_answer', 'solution', 'equivalent_answer_policy', 'answer_grid', 'answer_map'})


def redact_answers(value):
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key in ANSWER_KEYS:
                continue
            out[key] = redact_answers(item)
        return out
    if isinstance(value, list):
        return [redact_answers(v) for v in value]
    return value
