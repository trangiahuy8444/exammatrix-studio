"""Trusted server policies and explicit assessment references."""
from decimal import Decimal


ASIAN_SCHOOL_POLICY = {'id': 'asian-school', 'minimum_revision_percent': 90}


def resolve_similarity(value, policy=None):
    # Lazy import keeps legacy BankService able to consume these shared rules.
    from bank_service import ServiceError, number
    policy = ASIAN_SCHOOL_POLICY if policy is None else policy
    minimum = number(policy['minimum_revision_percent'], 'Ngưỡng tối thiểu')
    percent = number(value, 'Tỉ lệ đề cương')
    if not Decimal(0) <= minimum <= percent <= Decimal(100):
        raise ServiceError(f'Tỉ lệ đề cương phải từ {minimum:g}% đến 100%; không được hạ dưới quy định.')
    return percent


def require_revision(records, revision_id, grade):
    from bank_service import ServiceError
    revision = next((r for r in records if r.get('id') == revision_id), None)
    if not isinstance(revision_id, str) or not revision_id or revision is None:
        raise ServiceError('Đề cương đối chiếu không tồn tại. Hãy chọn đúng phiên bản, không tự thay bằng bản mới nhất.', status=409)
    if revision.get('grade') != grade:
        raise ServiceError('Đề cương đối chiếu phải cùng khối với đề kiểm tra.')
    return revision
