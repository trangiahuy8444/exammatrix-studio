"""
Inspection & verification script for real sample exports in ExamMatrix Studio.
Generates real Word (.docx), XeLaTeX (.tex), and compiles to PDF via /Library/TeX/texbin/xelatex.
Verifies typography, margins, table widths, tblHeader, and consistency between Word and PDF.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

# Add app root to path
APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

from bank_service import BankService
from matrices.service import MatrixService
from exports import export_document
from latex_generator import (
    generate_exam_latex,
    generate_matrix_latex,
    generate_review_latex
)


def verify_docx_properties(docx_bytes: bytes, label: str):
    print(f"\n--- Checking DOCX properties: {label} ---")
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        doc_xml = z.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(doc_xml)
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

        # Check section margins
        sectPr = root.find('.//w:sectPr', ns)
        if sectPr is not None:
            pgMar = sectPr.find('w:pgMar', ns)
            if pgMar is not None:
                top = int(pgMar.attrib.get(f'{{{ns["w"]}}}top', 0)) / 567.0 # cm
                bottom = int(pgMar.attrib.get(f'{{{ns["w"]}}}bottom', 0)) / 567.0
                left = int(pgMar.attrib.get(f'{{{ns["w"]}}}left', 0)) / 567.0
                right = int(pgMar.attrib.get(f'{{{ns["w"]}}}right', 0)) / 567.0
                print(f"  [Margin] Top: {top:.1f} cm, Bottom: {bottom:.1f} cm, Left: {left:.1f} cm, Right: {right:.1f} cm")

            pgSz = sectPr.find('w:pgSz', ns)
            if pgSz is not None:
                w = int(pgSz.attrib.get(f'{{{ns["w"]}}}w', 0)) / 567.0
                h = int(pgSz.attrib.get(f'{{{ns["w"]}}}h', 0)) / 567.0
                orient = pgSz.attrib.get(f'{{{ns["w"]}}}orient', 'portrait')
                print(f"  [Page Size] Width: {w:.1f} cm, Height: {h:.1f} cm (Orientation: {orient})")

        # Check tables
        tables = root.findall('.//w:tbl', ns)
        print(f"  [Tables] Total tables: {len(tables)}")
        for idx, tbl in enumerate(tables):
            # Check tblHeader
            headers = tbl.findall('.//w:trPr/w:tblHeader', ns)
            # Check table cell widths
            cells = tbl.findall('.//w:tcPr/w:tcW', ns)
            total_w = sum(int(c.attrib.get(f'{{{ns["w"]}}}w', 0)) for c in tbl.findall('.//w:tr[1]//w:tcPr/w:tcW', ns)) / 567.0
            print(f"    Table {idx+1}: width ~ {total_w:.1f} cm | tblHeader rows: {len(headers)}")
            if total_w > 24.5:
                print(f"    WARNING: Table {idx+1} width ({total_w:.1f} cm) exceeds 24.0 cm limit!")


def compile_xelatex(tex_content: str, output_pdf_path: Path):
    temp_dir = output_pdf_path.parent / "_build_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    tex_file = temp_dir / output_pdf_path.with_suffix('.tex').name
    tex_file.write_text(tex_content, encoding='utf-8')

    xelatex_bin = "/Library/TeX/texbin/xelatex"
    if not os.path.exists(xelatex_bin):
        xelatex_bin = "xelatex"

    # Compile 2 passes for page numbering Trang X/Y
    for p in (1, 2):
        cmd = [xelatex_bin, "-interaction=nonstopmode", "-halt-on-error", tex_file.name]
        proc = subprocess.run(cmd, cwd=temp_dir, capture_output=True, text=True)
        if proc.returncode != 0:
            print(f"XeLaTeX error on pass {p}: {proc.stderr[:300]}")
            # Print excerpt of log
            log_file = tex_file.with_suffix('.log')
            if log_file.exists():
                print(log_file.read_text(encoding='utf-8', errors='ignore')[-600:])
            return False

    built_pdf = tex_file.with_suffix('.pdf')
    if built_pdf.exists():
        shutil.copy2(built_pdf, output_pdf_path)
        print(f"  [PDF Generated] {output_pdf_path} ({output_pdf_path.stat().st_size} bytes)")
        return True
    return False


def main():
    sample_dir = APP_ROOT / "sample_exports"
    sample_dir.mkdir(parents=True, exist_ok=True)

    from server import DEFAULT_BANK
    svc = BankService(DEFAULT_BANK, APP_ROOT / "data")
    msvc = MatrixService(svc)

    exams = svc._records('exams')
    revisions = svc._records('revisions')
    matrices = msvc.list()

    print(f"Loaded {len(exams)} exams, {len(revisions)} revisions, {len(matrices)} matrices.")

    # Pick sample exam (e.g. Grade 10 or Grade 8)
    sample_exam = next((e for e in exams if e.get('grade') == 10 and e.get('questions')), exams[0] if exams else None)
    sample_rev = next((r for r in revisions if r.get('grade') == 10 and r.get('questions')), revisions[0] if revisions else None)
    sample_mat = next((m for m in matrices if m.get('grade') == 10), matrices[0] if matrices else None)

    if not sample_exam:
        print("No exam found to export.")
        return

    # 1. Export Exam Student DOCX & TeX/PDF
    print(f"\n==========================================")
    print(f"1. EXAM (STUDENT) - {sample_exam.get('title')}")
    docx_bytes, _, fn_docx = export_document(sample_exam, fmt='docx', answers=False)
    p_docx = sample_dir / f"De_thi_hoc_sinh_{sample_exam.get('grade', 10)}.docx"
    p_docx.write_bytes(docx_bytes)
    verify_docx_properties(docx_bytes, "Đề thi học sinh DOCX")

    tex_str = generate_exam_latex(sample_exam, answers=False)
    p_tex = sample_dir / f"De_thi_hoc_sinh_{sample_exam.get('grade', 10)}.tex"
    p_tex.write_text(tex_str, encoding='utf-8')
    p_pdf = sample_dir / f"De_thi_hoc_sinh_{sample_exam.get('grade', 10)}.pdf"
    compile_xelatex(tex_str, p_pdf)

    # 2. Export Exam Teacher DOCX & TeX/PDF
    print(f"\n==========================================")
    print(f"2. EXAM (TEACHER / HD CHẤM) - {sample_exam.get('title')}")
    docx_bytes_t, _, _ = export_document(sample_exam, fmt='docx', answers=True)
    p_docx_t = sample_dir / f"Huong_dan_cham_{sample_exam.get('grade', 10)}.docx"
    p_docx_t.write_bytes(docx_bytes_t)
    verify_docx_properties(docx_bytes_t, "Hướng dẫn chấm DOCX")

    tex_str_t = generate_exam_latex(sample_exam, answers=True)
    p_tex_t = sample_dir / f"Huong_dan_cham_{sample_exam.get('grade', 10)}.tex"
    p_tex_t.write_text(tex_str_t, encoding='utf-8')
    p_pdf_t = sample_dir / f"Huong_dan_cham_{sample_exam.get('grade', 10)}.pdf"
    compile_xelatex(tex_str_t, p_pdf_t)

    # 3. Export Revision DOCX & TeX/PDF
    if sample_rev:
        print(f"\n==========================================")
        print(f"3. REVISION (ĐỀ CƯƠNG) - {sample_rev.get('title')}")
        docx_bytes_r, _, _ = export_document(sample_rev, fmt='docx', answers=True, revision=True)
        p_docx_r = sample_dir / f"De_cuong_on_tap_{sample_rev.get('grade', 10)}.docx"
        p_docx_r.write_bytes(docx_bytes_r)
        verify_docx_properties(docx_bytes_r, "Đề cương ôn tập DOCX")

        tex_str_r = generate_review_latex(sample_rev)
        p_tex_r = sample_dir / f"De_cuong_on_tap_{sample_rev.get('grade', 10)}.tex"
        p_tex_r.write_text(tex_str_r, encoding='utf-8')
        p_pdf_r = sample_dir / f"De_cuong_on_tap_{sample_rev.get('grade', 10)}.pdf"
        compile_xelatex(tex_str_r, p_pdf_r)

    # 4. Export Matrix & Spec table DOCX & TeX/PDF
    if sample_mat:
        print(f"\n==========================================")
        print(f"4. MATRIX & SPEC TABLE - Khối {sample_mat.get('grade')}")
        from matrices.exports import export_matrix
        mat_docx, _, _ = export_matrix(sample_mat, svc.catalog, 'docx')
        p_docx_m = sample_dir / f"Ma_tran_dac_ta_{sample_mat.get('grade', 10)}.docx"
        p_docx_m.write_bytes(mat_docx)
        verify_docx_properties(mat_docx, "Ma trận & Bảng đặc tả DOCX")

        tex_str_m = generate_matrix_latex(sample_mat)
        p_tex_m = sample_dir / f"Ma_tran_dac_ta_{sample_mat.get('grade', 10)}.tex"
        p_tex_m.write_text(tex_str_m, encoding='utf-8')
        p_pdf_m = sample_dir / f"Ma_tran_dac_ta_{sample_mat.get('grade', 10)}.pdf"
        compile_xelatex(tex_str_m, p_pdf_m)

    # 5. Export ZIP Bundle
    print(f"\n==========================================")
    print(f"5. EXAM BUNDLE ZIP EXPORT")
    zip_bytes, _, zip_fn = svc.export_exam_bundle(sample_exam['id'], msvc, fmt='docx')
    p_zip = sample_dir / zip_fn
    p_zip.write_bytes(zip_bytes)
    print(f"  [ZIP Generated] {p_zip} ({len(zip_bytes)} bytes)")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        print(f"  [ZIP Contents] {len(zf.namelist())} files:")
        for name in zf.namelist():
            print(f"    - {name}")

    print("\n--- SAMPLE GENERATION & VERIFICATION COMPLETED ---")


if __name__ == '__main__':
    main()
