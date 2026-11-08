"""Mốc A4: dòng "Tỉ lệ %" và "Tỉ lệ chung" của bản đặc tả theo mẫu GK1 Khối 8, 9 đã nộp."""
import unittest

from matrices.exports import spec_ratio_lines


def view(cells):
    by_level = {'Biết': dict(points=0.0), 'Hiểu': dict(points=0.0), 'Vận dụng': dict(points=0.0)}
    for key, c in cells.items():
        by_level[key.split('|')[1]]['points'] += c['points']
    return dict(rows=[dict(cells=cells)], totals=dict(by_level=by_level))


class SpecRatioTests(unittest.TestCase):
    def test_grade9_gk1_like_template(self):
        v = view({'MC|Biết': dict(count=16, points=4.0), 'MC|Hiểu': dict(count=12, points=3.0),
                  'ES|Vận dụng': dict(count=3, points=3.0)})
        ratio, tnkq, tl = spec_ratio_lines(v, 10)
        self.assertEqual(ratio, '16 câu B = 40%, 12 câu H = 30%, 3 câu VD = 30%')
        self.assertEqual(tnkq, 'B + H = 70%')
        self.assertEqual(tl, 'VD = 30%')

    def test_levels_without_items_are_omitted(self):
        v = view({'MC|Biết': dict(count=20, points=5.0), 'ES|Hiểu': dict(count=1, points=2.0),
                  'ES|Vận dụng': dict(count=3, points=3.0)})
        ratio, tnkq, tl = spec_ratio_lines(v, 10)
        self.assertEqual(ratio, '20 câu B = 50%, 1 câu H = 20%, 3 câu VD = 30%')
        self.assertEqual(tnkq, 'B = 50%')
        self.assertEqual(tl, 'H + VD = 50%')


if __name__ == '__main__':
    unittest.main()


class LatexMatrixLikeTemplateTests(unittest.TestCase):
    def tex(self):
        import latex_layout
        from matrix_fixtures import minimal_matrix
        return latex_layout.matrix(minimal_matrix())

    def test_titles_like_approved_word_matrix_without_school_name(self):
        tex = self.tex()
        self.assertIn('MA TRẬN ĐỀ KIỂM TRA GIỮA KÌ 1', tex)
        self.assertIn('BẢNG ĐẶC TẢ ĐỀ KIỂM TRA GIỮA KÌ 1', tex)
        self.assertIn('THỜI GIAN LÀM BÀI: 45 PHÚT', tex)
        self.assertNotIn('TRƯỜNG TH, THCS VÀ THPT', tex)

    def test_specification_has_total_rows(self):
        tex = self.tex()
        for name in ('Tổng', r'Tỉ lệ \%', 'Tỉ lệ chung'):
            self.assertIn(name, tex.split('BẢNG ĐẶC TẢ', 1)[1])


class SpecPageBreakTests(unittest.TestCase):
    def four_topic_matrix(self):
        from matrix_fixtures import minimal_matrix
        m = minimal_matrix()
        m['lessons'] = [dict(lesson_code=f'B{i}', title=f'Bài {i}', topic=f'Chủ đề {i}') for i in range(1, 5)]
        m['requirements'] = [dict(id=f'R{i}', lesson_code=f'B{i}', level='Biết', text=f'Nhận biết {i}.',
                                  ppct_outcome_index=0, competency='NLa', choice_group=None) for i in range(1, 5)]
        m['slots'] = [dict(id=f'S{i}', kind='MC', number=i, scoring=dict(mode='sum_parts'),
                           parts=[dict(id=f'P{i}', label='', requirement_id=f'R{i}', points=2.5, indicator='')])
                      for i in range(1, 5)]
        return m

    def test_spec_breaks_after_every_two_topics_rule03(self):
        import latex_layout
        spec = latex_layout.matrix(self.four_topic_matrix()).split('BẢNG ĐẶC TẢ', 1)[1]
        self.assertEqual(spec.count(r'\pagebreak'), 1)
        self.assertLess(spec.index('Chủ đề 2'), spec.index(r'\pagebreak'))
        self.assertLess(spec.index(r'\pagebreak'), spec.index('Chủ đề 3'))
