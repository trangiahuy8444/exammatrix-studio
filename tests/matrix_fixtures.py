import copy
import json
import tempfile
from pathlib import Path
from test_backend import fixture


def bank_fixture():
    bank = fixture()
    for lesson in bank['ppct']['lessons']:
        lesson['grade'] = 9
    for q in bank['questions']:
        q['grade'] = 9
    return bank


def minimal_matrix():
    return dict(id='', family_id='', version=1, revision=0, status='draft',
        mode='authored', profile='THCS', grade=9, school_year='2026-2027',
        exam_type='GK1', duration=45, title='Ma trận thử', owner_name='GV thử',
        campus='Cao Thắng', total_points=10,
        lessons=[dict(lesson_code='B1', title='Bài 1', topic='Chủ đề 1')],
        requirements=[dict(id='R1', lesson_code='B1', level='Biết',
            text='Nhận biết dữ liệu.', ppct_outcome_index=0,
            competency='NLa', choice_group=None)],
        slots=[dict(id='S1', kind='MC', number=1,
            parts=[dict(id='P1', label='', requirement_id='R1', points=10, indicator='')],
            scoring=dict(mode='sum_parts'))],
        indicator_catalog=[], source=None,
        reconciliation=dict(confirmed=True, issues=[]), audit=[])


def confirmation():
    return dict(confirmed_by='GV thử', confirmed_at='2026-10-21',
                basis='Bản thống nhất dùng để kiểm chứng', external_agreement=True)


class MatrixFixture:
    def setup_services(self):
        from bank_service import BankService
        from matrices.service import MatrixService
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        path = self.root/'bank.json'; path.write_text(json.dumps(bank_fixture()))
        self.bank = BankService(path, self.root/'data')
        self.ppct = self.bank.catalog
        self.matrices = MatrixService(self.bank)

    def locked_matrix(self):
        draft = self.matrices.save_draft(minimal_matrix(), 0)
        return self.matrices.lock(draft['id'], draft['revision'], confirmation())
