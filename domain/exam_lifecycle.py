"""Vòng đời đề kiểm tra (mốc B2).

drafting → pending_approval → locked → published. Đề locked/published không sửa, không xóa được; muốn sửa phải tạo
bản chỉnh sửa mới (trở về drafting, không kế thừa phê duyệt). Phát hành chỉ khi hash nội dung khớp hash lúc duyệt.
"""
import hashlib
import json

STATES = ('drafting', 'pending_approval', 'locked', 'published')
FROZEN = ('locked', 'published')
STATE_LABELS = {'drafting': 'Đang soạn', 'pending_approval': 'Chờ duyệt', 'locked': 'Đã duyệt & khóa',
                'published': 'Đã phát hành'}

# Trường quản trị, không thuộc nội dung đề. Mọi trường khác (kể cả trường mới thêm sau này) đều vào hash.
ADMIN_FIELDS = frozenset({
    'status', 'lifecycle', 'approved_hash', 'approved_by', 'approved_at', 'locked_at', 'published_at', 'usage',
    'updated_at', 'created_at', 'verification', 'needs_verification', 'previous_exam_id', 'reuse_check', 'revision_check',
})


def exam_status(exam):
    status = (exam or {}).get('status') or 'drafting'
    return status if status in STATES else 'drafting'


def exam_content(exam):
    return {k: v for k, v in (exam or {}).items() if k not in ADMIN_FIELDS}


def exam_hash(exam):
    raw = json.dumps(exam_content(exam), sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(raw.encode()).hexdigest()
