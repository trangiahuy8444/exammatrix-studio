"""Lỗi nghiệp vụ dùng chung; bank_service xuất lại tên ServiceError cho mã cũ."""


class ServiceError(Exception):
    def __init__(self, error, details=None, status=400):
        super().__init__(error)
        self.error, self.details, self.status = error, details, status
