"""Mốc A6: xuất PDF an toàn trong ứng dụng."""
import shutil
import unittest
from unittest.mock import patch
from pathlib import Path
from unittest import mock

import pdf_build
from bank_service import ServiceError
from exports import export_document
from test_export_roundtrip import exam

HAS_XELATEX = bool(pdf_build.find_xelatex())


class PdfBuildPolicyTests(unittest.TestCase):
    def test_missing_xelatex_gives_clear_400(self):
        with mock.patch.object(pdf_build, 'find_xelatex', return_value=None):
            with self.assertRaises(ServiceError) as ctx:
                pdf_build.compile_latex('\\documentclass{article}\\begin{document}x\\end{document}')
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn('XeLaTeX', ctx.exception.error)

    def test_shell_escape_is_refused(self):
        if not HAS_XELATEX:
            self.skipTest('máy không có XeLaTeX')
        tex = ('\\documentclass{article}\\begin{document}'
               '\\immediate\\write18{touch /tmp/ngan_hang_pwned}x\\end{document}')
        Path('/tmp/ngan_hang_pwned').unlink(missing_ok=True)
        try:
            pdf_build.compile_latex(tex)
        except ServiceError:
            pass
        self.assertFalse(Path('/tmp/ngan_hang_pwned').exists())

    def test_compile_error_reports_without_leaking_paths(self):
        if not HAS_XELATEX:
            self.skipTest('máy không có XeLaTeX')
        with self.assertRaises(ServiceError) as ctx:
            pdf_build.compile_latex('\\documentclass{article}\\begin{document}\\undefinedcommand\\end{document}')
        self.assertEqual(ctx.exception.status, 422)
        self.assertNotIn('/tmp', str(ctx.exception.details))


def fake_word(raw):
    assert raw[:2] == b'PK', 'PDF phải được chuyển từ tệp Word'
    return b'%PDF-from-word'


@patch('pdf_build.docx_to_pdf', side_effect=fake_word)
class PdfExportTests(unittest.TestCase):
    """PDF đề, đáp án, đề cương và ma trận đều chuyển từ chính tệp Word."""

    def test_exam_pdf_student_and_teacher(self, conv):
        for answers in (False, True):
            raw, mime, name = export_document(exam(), 'pdf', answers=answers)
            self.assertEqual(mime, 'application/pdf')
            self.assertEqual(raw, b'%PDF-from-word')
            self.assertTrue(name.endswith('.pdf'))

    def test_review_guide_pdf(self, conv):
        raw, mime, _ = export_document(exam(), 'pdf', revision=True)
        self.assertEqual(raw, b'%PDF-from-word')

    def test_matrix_pdf(self, conv):
        from matrices.exports import export_matrix
        from matrix_fixtures import minimal_matrix, bank_fixture
        raw, mime, name = export_matrix(minimal_matrix(), bank_fixture()['ppct'], 'pdf')
        self.assertEqual(mime, 'application/pdf')
        self.assertEqual(raw, b'%PDF-from-word')
        self.assertTrue(name.endswith('.pdf'))


if __name__ == '__main__':
    unittest.main()
