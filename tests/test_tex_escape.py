"""Mốc A5/A6: tex_escape không làm mất nội dung và luôn sinh LaTeX biên dịch được."""
import unittest

from latex_generator import tex_escape


class TexEscapeTests(unittest.TestCase):
    def test_comparison_operators_are_kept(self):
        self.assertIn('a < b > c', tex_escape('so sánh a < b > c'))
        self.assertIn('if (a<b && b>c)', tex_escape('if (a<b && b>c)').replace(r'\&', '&'))

    def test_cpp_templates_are_kept(self):
        self.assertIn('vector<int>', tex_escape('vector<int> v;'))

    def test_lone_dollar_is_escaped_but_math_kept(self):
        self.assertEqual(tex_escape('giá 5$'), r'giá 5\$')
        self.assertEqual(tex_escape('Tính $x^2$ nhé'), 'Tính $x^2$ nhé')
        self.assertEqual(tex_escape('$$a+b$$'), '$$a+b$$')

    def test_braces_and_specials_escaped(self):
        self.assertEqual(tex_escape('{3} & 50% _ #'), r'\{3\} \& 50\% \_ \#')
        self.assertEqual(tex_escape('a\\b'), r'a\textbackslash{}b')

    def test_html_bold_italic_balanced(self):
        self.assertEqual(tex_escape('<b>đậm</b> và <i>nghiêng</i>'), r'\textbf{đậm} và \textit{nghiêng}')
        self.assertEqual(tex_escape('lẻ </b> thừa'), 'lẻ  thừa')
        self.assertEqual(tex_escape('<b>chưa đóng'), r'\textbf{chưa đóng}')

    def test_br_and_entities(self):
        self.assertEqual(tex_escape('dòng 1<br/>dòng 2 &amp; &lt;x&gt;'), 'dòng 1\ndòng 2 \\& <x>')


if __name__ == '__main__':
    unittest.main()
