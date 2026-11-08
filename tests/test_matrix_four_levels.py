"""G1-LEVEL4: dữ liệu minh họa, không đọc ngân hàng hay ma trận riêng."""
import copy
import io
import unittest

from docx import Document
from docx.shared import Cm
from matrix_fixtures import bank_fixture, minimal_matrix
from matrices.model import matrix_digest, matrix_view, validate_matrix
from matrices.exports import matrix_docx, matrix_html, spec_totals, spec_ratio_lines
from domain.matrix_checks import ratio_warnings, cell_check, shortfall_report
from test_matrix_checks import thpt_matrix, exam_from, PPCT


def four_level_matrix(profile='THCS'):
    m = minimal_matrix()
    m['profile'] = profile
    m['requirements'] = []
    m['slots'] = []
    for i, (level, points) in enumerate(zip(('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'), (4, 3, 2, 1)), 1):
        m['requirements'].append(dict(id=f'R{i}', lesson_code='B1', level=level,
            text=f'Yêu cầu minh họa {i}.', ppct_outcome_index=0, competency='NLa', choice_group=None))
        m['slots'].append(dict(id=f'S{i}', kind='ES', number=i,
            parts=[dict(id=f'P{i}', label='', requirement_id=f'R{i}', points=points, indicator='AC1' if profile=='THPT' else '')],
            scoring=dict(mode='sum_parts')))
    if profile == 'THPT':
        m['indicator_catalog'] = [dict(code='AC1', competency='NLa', text='Chỉ báo minh họa')]
    return m


class FourLevelMatrixTests(unittest.TestCase):
    def test_vdc_validates_and_counts_separately_without_changing_input(self):
        m = four_level_matrix(); before = copy.deepcopy(m)
        report = validate_matrix(m, bank_fixture()['ppct'], True)
        self.assertTrue(report['valid'], report)
        v = matrix_view(m)
        self.assertEqual(v['totals']['points'], 10)
        self.assertEqual(v['totals']['by_level']['Vận dụng cao'], dict(items=1, points=1))
        self.assertEqual(v['totals']['by_level']['Vận dụng'], dict(items=1, points=2))
        self.assertEqual(v['rows'][0]['counts']['Vận dụng cao'], 1)
        self.assertEqual(v['rows'][0]['cells']['ES|Vận dụng cao']['refs'], ['4'])
        self.assertEqual(v['requirements'][3]['refs'], ['4'])
        self.assertEqual(m, before)

    def test_received_vdc_keeps_source_level_and_rejects_relabel(self):
        m = four_level_matrix(); m['mode'] = 'received'
        m['requirements'][3]['source_index'] = 0
        m['lessons'][0]['source_index'] = 0
        m['slots'][3]['parts'][0].update(source_index=0, source_level='Vận dụng cao')
        self.assertTrue(validate_matrix(m, bank_fixture()['ppct'], True)['valid'])
        m['requirements'][3]['level'] = 'Vận dụng'
        report = validate_matrix(m, bank_fixture()['ppct'], True)
        self.assertIn('received_scope', [e['code'] for e in report['errors']])

    def test_vdc_has_own_docx_columns_specification_and_html(self):
        m = four_level_matrix()
        doc = Document(io.BytesIO(matrix_docx(m, bank_fixture()['ppct'], mode='web')))
        table = doc.tables[0]
        self.assertEqual(len(table.columns), 16)  # 3 mô tả + 2 dạng × 4 mức + 4 tổng + 1 tỉ lệ
        self.assertIn('VDC', table.cell(2, 10).text)
        self.assertIn('(4)', table.cell(3, 10).text)
        self.assertEqual(table.cell(3, 14).text, '1')
        self.assertEqual(table.cell(5, 14).text, '1')  # tổng điểm VDC
        self.assertLessEqual(sum(c.width for c in table.columns), Cm(24))
        text = '\n'.join(c.text for r in doc.tables[-1].rows for c in r.cells)
        self.assertIn('Vận dụng cao', text)
        self.assertIn('(Câu 4).', text)
        self.assertIn('VDC', text)
        self.assertIn('VDC', matrix_html(m, bank_fixture()['ppct'], mode='web').decode())
        v = matrix_view(m)
        self.assertIn('1 câu VDC', spec_totals(v)[1])
        self.assertIn('1 câu VDC = 10%', spec_ratio_lines(v)[0])

    def test_matrix_declared_margins_and_centered_table_keep_width_limit(self):
        m = four_level_matrix()
        doc = Document(io.BytesIO(matrix_docx(m, bank_fixture()['ppct'], 'matrix', 'web')))
        section = doc.sections[0]
        self.assertAlmostEqual(section.left_margin.cm, 1.5, places=2)
        self.assertAlmostEqual(section.right_margin.cm, 1, places=2)
        self.assertAlmostEqual(section.top_margin.cm, 1, places=2)
        self.assertAlmostEqual(section.bottom_margin.cm, 1, places=2)
        self.assertEqual(doc.tables[0].alignment, 1)
        self.assertLessEqual(sum(c.width for c in doc.tables[0].columns), Cm(24))
        html = matrix_html(m, bank_fixture()['ppct'], 'matrix', 'web').decode()
        self.assertIn('@page{size:A4 landscape;margin:1cm 1cm 1cm 1.5cm}', html)

    def test_vdc_competency_column_does_not_overwrite_next_competency(self):
        m = four_level_matrix('THPT')
        doc = Document(io.BytesIO(matrix_docx(m, bank_fixture()['ppct'], 'competencies', 'web')))
        t = doc.tables[0]
        self.assertEqual(len(t.columns), 15)  # 3 mô tả + 3 năng lực × 4 mức
        self.assertEqual(t.cell(7, 6).text, 'AC1')
        self.assertEqual(t.cell(7, 7).text, '')
        self.assertIn('Vận dụng cao', t.cell(3, 6).text)
        self.assertLessEqual(sum(c.width for c in t.columns), Cm(24))

    def test_old_three_level_word_import_does_not_read_a_fourth_source_column(self):
        from matrices.import_docx import inspect_docx
        m = minimal_matrix(); ppct = bank_fixture()['ppct']
        raw = matrix_docx(m, ppct, mode='web')
        result = inspect_docx(raw, 'minh-hoa-ba-muc.docx', 9, ppct)
        self.assertEqual(len(result['candidate']['slots']), 1)
        self.assertEqual(result['candidate']['slots'][0]['kind'], 'MC')
        self.assertEqual(result['candidate']['slots'][0]['parts'][0]['source_level'], 'Biết')
        self.assertEqual(result['raw_tables'][0]['columns'], 13)

    def test_old_locked_content_hash_stays_unchanged(self):
        m = minimal_matrix(); m.update(status='locked', revision=9)
        self.assertEqual(matrix_digest(m), 'd079dfe96146185fdb944421847c54eb9cdfb78c5a86fdb009879e22bb94733c')

    def test_three_level_reference_counts_vdc_as_technical_combination(self):
        m = thpt_matrix(); m['requirements'].append(dict(m['requirements'][2], id='R4', level='Vận dụng cao'))
        m['slots'][-1]['parts'][-1]['requirement_id'] = 'R4'
        before = copy.deepcopy(m)
        self.assertEqual(ratio_warnings(m), [])  # 1,5 VD + 1,5 VDC = tham khảo 3
        self.assertEqual(m, before)
        m['slots'][-1]['parts'][-1]['points'] = .5
        w = [w for w in ratio_warnings(m) if w['code']=='ratio_level']
        self.assertEqual(len(w), 1)
        self.assertEqual(w[0]['actual'], '2')
        self.assertIn('quy đổi kỹ thuật', w[0]['message'])
        self.assertIn('Vận dụng cao', w[0]['message'])
        self.assertEqual(before['requirements'], m['requirements'])

    def test_cell_check_and_shortfall_keep_vdc_distinct_and_only_approved_counts(self):
        m = thpt_matrix(); m['requirements'][2]['level'] = 'Vận dụng cao'
        exam = exam_from(m)
        self.assertTrue(cell_check(exam, m, PPCT)['ok'])
        exam['questions'][-1]['level'] = 'Vận dụng'
        self.assertFalse(cell_check(exam, m, PPCT)['ok'])
        questions = exam_from(m)['questions']; questions[-1].update(grade=10, review_status='draft')
        r = shortfall_report(m, questions, PPCT)
        cell = next(c for c in r['cells'] if c['level']=='Vận dụng cao')
        self.assertEqual((cell['approved'], cell['draft'], cell['shortfall']), (0, 1, 1))


from matrix_fixtures import MatrixFixture, confirmation
from bank_service import ServiceError
from domain.review import CHECKLIST
from matrices.generation import matrix_candidates, generate_from_matrix


class FourLevelBankWorkflowTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()

    def new_question(self, level):
        q = copy.deepcopy(self.bank.state()['bank']['questions'][0])
        q.pop('id'); q.update(level=level, question='Câu minh họa mới mức ' + level + '?', review_status='draft')
        return self.bank.save_question(q)

    def approve(self, q):
        self.bank.review_question(q['id'], 'submit')
        with self.assertRaises(ServiceError):
            self.bank.review_question(q['id'], 'approve', checklist={})
        return self.bank.review_question(q['id'], 'approve', checklist={c['key']: True for c in CHECKLIST})

    def test_save_review_candidates_and_matrix_exam_preserve_vdc(self):
        m = minimal_matrix(); m['requirements'][0]['level'] = 'Vận dụng cao'
        draft = self.matrices.save_draft(m, 0)
        locked = self.matrices.lock(draft['id'], draft['revision'], confirmation())
        q = self.new_question('Vận dụng cao')
        self.assertEqual(q['review_status'], 'draft')
        self.assertEqual(matrix_candidates(self.bank, self.matrices, locked['id'])['slots'][0]['candidates'], [])
        vd = self.approve(self.new_question('Vận dụng'))
        self.approve(q)
        candidates = matrix_candidates(self.bank, self.matrices, locked['id'])['slots'][0]['candidates']
        self.assertEqual([c['id'] for c in candidates], [q['id']])
        self.assertNotIn(vd['id'], [c['id'] for c in candidates])
        exam = generate_from_matrix(self.bank, self.matrices, dict(matrix_id=locked['id'],
            title='Đề minh họa VDC', campus='Cao Thắng', exam_code='101',
            placements=[dict(slot_id='S1', question_id=q['id'], reviewed_part_ids=['P1'])]))
        self.assertEqual(exam['questions'][0]['level'], 'Vận dụng cao')
        self.assertEqual(exam['questions'][0]['points'], 10)
        changed = copy.deepcopy(q); changed['question'] = 'Nội dung VDC đã thay đổi?'
        self.assertEqual(self.bank.save_question(changed)['review_status'], 'needs_review')
        self.assertEqual(self.bank.state()['exams'][0]['questions'][0]['question'], q['question'])
        self.assertEqual(matrix_candidates(self.bank, self.matrices, locked['id'])['slots'][0]['candidates'], [])

    def test_vdc_blueprint_is_accepted_without_using_other_levels(self):
        q = self.approve(self.new_question('Vận dụng cao'))
        exam = self.bank.generate_exam(dict(title='KTTX minh họa VDC', grade=9, exam_type='TX', duration=15,
            blueprint=[dict(lesson_code='B1', type='MC', level='Vận dụng cao', count=1, points_per_question=10)]))
        self.assertEqual([x['id'] for x in exam['questions']], [q['id']])
        self.assertEqual(exam['questions'][0]['level'], 'Vận dụng cao')
        with self.assertRaises(ServiceError):
            self.new_question('Mức không có')

    def test_vdc_exam_set_keeps_level_and_approved_question(self):
        q = self.approve(self.new_question('Vận dụng cao'))
        result = self.bank.generate_exam_set(dict(title='Bộ đề minh họa VDC', grade=9, exam_type='TX', duration=15,
            exam_count=1, blueprint=[dict(lesson_code='B1', type='MC', level='Vận dụng cao', count=1, points_per_question=10)]))
        self.assertEqual(result['exams'][0]['questions'][0]['id'], q['id'])
        self.assertEqual(result['exams'][0]['questions'][0]['level'], 'Vận dụng cao')


class FourLevelImportedExamVerificationTests(unittest.TestCase):
    def test_vdc_in_import_verification_is_separate_and_wrong_or_missing_level_does_not_match(self):
        from docx_exam_importer import verify_exam_against_matrix
        m = minimal_matrix(); m['requirements'][0]['level'] = 'Vận dụng cao'
        exam = dict(grade=9, questions=[dict(id='Q-VDC', type='MC', level='Vận dụng cao', points=10,
            question='Câu minh họa rõ mức VDC?', slot_number=1, lesson_code='B1')])
        correct = verify_exam_against_matrix(exam, m)
        vdc = next(c for c in correct['level_checks'] if c['level']=='Vận dụng cao')
        self.assertEqual((vdc['expected_points'], vdc['actual_points'], vdc['matched']), (10, 10, True))
        for level in ('Vận dụng', None):
            changed = copy.deepcopy(exam)
            if level is None:
                changed['questions'][0].pop('level')
            else:
                changed['questions'][0]['level'] = level
            result = verify_exam_against_matrix(changed, m)
            vdc = next(c for c in result['level_checks'] if c['level']=='Vận dụng cao')
            self.assertEqual(vdc['actual_points'], 0)
            self.assertFalse(vdc['matched'])
