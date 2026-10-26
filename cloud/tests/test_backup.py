"""Mốc A8: diễn tập sao lưu, kiểm tra và khôi phục nhất quán (CSDL + JSON + tệp nguồn)."""
import copy
import hashlib
import json
import sqlite3
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TransactionTestCase

from assessment.backup import create_backup, restore_backup, verify_backup
from assessment.legacy_storage import bank_for_user
from assessment.models import LegacyState, LegacyStateVersion, StoredSource
from workspace.models import Workspace

DOCX = b'PK\x03\x04 ma tran goc mau'
PNG = b'\x89PNG\r\n\x1a\n trang 1'
DIGEST = hashlib.sha256(DOCX).hexdigest()


def seed(user):
    svc = bank_for_user(user)
    st = svc.storage
    bank = st.read(svc.bank_path)
    bank['questions'] = [dict(id=f'Q{i}', grade=9, type='MC', question=f'Câu mẫu {i}?') for i in range(3)]
    st.save(svc.bank_path, bank)
    st.save(svc.data_dir/'exams.json', [dict(id='E1', title='Đề mẫu đã phát hành', question_ids=['Q0', 'Q1'],
                                             snapshot_hash='abc')])
    st.save(svc.data_dir/'matrices/records.json', [dict(id='MATRIX-1', source=dict(sha256=DIGEST, filename='mt.docx'))])
    st.write_source(f'matrices/sources/{DIGEST}.docx', DOCX)
    st.write_source(f'matrices/sources/{DIGEST}_pages/page-1.png', PNG)
    return st.state


class BackupDrillTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('gv', password='Teacher-Test-5829!')
        Workspace.objects.create(owner=self.user)
        self.state = seed(self.user)
        self.original = copy.deepcopy(LegacyState.objects.get(pk=self.state.pk).documents)
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)/'bk'

    def test_backup_contains_consistent_db_json_and_sources(self):
        manifest = create_backup(self.dir)
        self.assertTrue(manifest['database']['included'])
        self.assertIn(f'sources/{self.state.pk}/matrices/sources/{DIGEST}.docx', manifest['files'])
        db = sqlite3.connect(self.dir/'db.sqlite3')
        self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(db.execute(f'SELECT count(*) FROM "{StoredSource._meta.db_table}"').fetchone()[0], 2)
        db.close()
        report = verify_backup(self.dir)
        self.assertTrue(report['ok'], report)
        self.assertEqual(report['warnings'], [])

    def test_backup_refuses_non_empty_target(self):
        self.dir.mkdir(); (self.dir/'x').write_text('cũ')
        with self.assertRaises(FileExistsError):
            create_backup(self.dir)

    def test_verify_detects_tampering_and_missing_source(self):
        create_backup(self.dir)
        (self.dir/'states'/f'{self.state.pk}.json').write_text('{}', encoding='utf-8')
        (self.dir/'sources'/str(self.state.pk)/'matrices'/'sources'/f'{DIGEST}.docx').unlink()
        report = verify_backup(self.dir)
        self.assertFalse(report['ok'])
        self.assertTrue(any('Hash không khớp' in e for e in report['errors']))
        self.assertTrue(any('Thiếu tệp' in e for e in report['errors']))
        with self.assertRaises(ValueError):
            restore_backup(self.dir, apply=True)

    def test_reference_missing_before_backup_is_warning_not_error(self):
        StoredSource.objects.filter(key__endswith='.docx').delete()
        create_backup(self.dir)
        report = verify_backup(self.dir)
        self.assertTrue(report['ok'], report)
        self.assertTrue(any('đã không có từ trước' in w for w in report['warnings']))

    def test_restore_drill_brings_back_exam_bank_and_images(self):
        create_backup(self.dir)
        # Sự cố: xóa câu hỏi, sửa đề đã phát hành, mất ảnh trang; thêm một tệp nguồn mới sau sao lưu.
        svc = bank_for_user(self.user); st = svc.storage
        bank = st.read(svc.bank_path); bank['questions'] = bank['questions'][:1]; st.save(svc.bank_path, bank)
        st.save(svc.data_dir/'exams.json', [dict(id='E1', title='Bị sửa nhầm')])
        StoredSource.objects.filter(key__endswith='.png').delete()
        st.write_source('matrices/sources/moi.docx', b'PK moi')
        versions_before = LegacyStateVersion.objects.count()

        dry = restore_backup(self.dir, apply=False)
        self.assertEqual(sorted(dry['plan'][0]['documents']), ['bank', 'exams'])
        self.assertEqual(LegacyState.objects.get(pk=self.state.pk).documents['exams'][0]['title'], 'Bị sửa nhầm')

        result = restore_backup(self.dir, apply=True)
        restored = LegacyState.objects.get(pk=self.state.pk)
        self.assertEqual(restored.documents, self.original)
        png = StoredSource.objects.get(state=restored, key__endswith='page-1.png')
        self.assertEqual(bytes(png.content), PNG)
        self.assertEqual(png.digest, hashlib.sha256(PNG).hexdigest())
        self.assertTrue(StoredSource.objects.filter(key='matrices/sources/moi.docx').exists())  # không xóa tệp mới
        self.assertEqual(result['plan'][0]['kept_newer_sources'], ['matrices/sources/moi.docx'])
        self.assertEqual(LegacyStateVersion.objects.count(), versions_before + 2)  # bản trước khi khôi phục được giữ

    def test_commands(self):
        out = StringIO()
        call_command('backup_local', out=str(self.dir), stdout=out)
        self.assertTrue(json.loads(out.getvalue())['verify']['ok'])
        call_command('verify_backup', str(self.dir), stdout=StringIO())
        dry = StringIO(); call_command('restore_local', str(self.dir), '--dry-run', stdout=dry)
        self.assertFalse(json.loads(dry.getvalue())['applied'])
        (self.dir/'manifest.json').write_text('hỏng', encoding='utf-8')
        with self.assertRaises(CommandError):
            call_command('verify_backup', str(self.dir), stdout=StringIO())


class DiskSourceTests(TransactionTestCase):
    """Tệp nguồn cũ nằm trên đĩa (MEDIA_ROOT) vẫn được read_source dùng, nên phải có trong bản sao lưu."""

    def setUp(self):
        from django.test import override_settings
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        media = Path(self.tmp.name)/'media'
        override = override_settings(MEDIA_ROOT=media); override.enable(); self.addCleanup(override.disable)
        self.user = get_user_model().objects.create_user('gv2', password='Teacher-Test-5829!')
        Workspace.objects.create(owner=self.user)
        self.svc = bank_for_user(self.user)
        self.png = self.svc.data_dir/'matrices'/'sources'/f'{DIGEST}_pages'/'page-2.png'
        self.png.parent.mkdir(parents=True); self.png.write_bytes(PNG)
        self.dir = Path(self.tmp.name)/'bk'

    def test_disk_source_backed_up_verified_and_restored(self):
        manifest = create_backup(self.dir)
        self.assertEqual(manifest['states'][0]['disk_sources'], 1)
        self.assertTrue(verify_backup(self.dir)['ok'])
        self.png.unlink()
        self.assertFalse(self.svc.source_exists(f'matrices/sources/{DIGEST}_pages/page-2.png'))
        restore_backup(self.dir, apply=True)
        self.assertEqual(self.png.read_bytes(), PNG)
        self.assertTrue(self.svc.source_exists(f'matrices/sources/{DIGEST}_pages/page-2.png'))

    def test_dry_run_does_not_write_disk(self):
        create_backup(self.dir)
        self.png.unlink()
        plan = restore_backup(self.dir, apply=False)['plan'][0]
        self.assertEqual(plan['disk_sources'], [f'matrices/sources/{DIGEST}_pages/page-2.png'])
        self.assertFalse(self.png.exists())


class PublishedExamRestoreTests(TransactionTestCase):
    """Tiêu chí nghiệm thu: khôi phục một đề đã phát hành kèm ảnh trang, khớp hash lúc duyệt."""

    def test_published_exam_and_page_image_restore_to_approved_hash(self):
        from domain.exam_lifecycle import exam_hash
        user = get_user_model().objects.create_user('gv_ph', password='Teacher-Test-5829!')
        Workspace.objects.create(owner=user)
        state = seed(user)
        svc = bank_for_user(user); st = svc.storage
        exam = dict(id='E-PH', title='Đề đã phát hành', grade=9, exam_type='CK1', status='published',
                    questions=[dict(id='Q0', type='MC', question='Câu mẫu 0?', options=['a', 'b', 'c', 'd'], correct=2, points=10)])
        exam['approved_hash'] = exam_hash(exam)
        st.save(svc.data_dir/'exams.json', [exam])
        with tempfile.TemporaryDirectory() as tmp:
            create_backup(Path(tmp)/'bk')
            st.save(svc.data_dir/'exams.json', [dict(exam, questions=[dict(exam['questions'][0], correct=0)])])
            StoredSource.objects.filter(key__endswith='.png').delete()
            restore_backup(Path(tmp)/'bk', apply=True)
        restored = LegacyState.objects.get(pk=state.pk).documents['exams'][0]
        self.assertEqual(exam_hash(restored), restored['approved_hash'])
        self.assertEqual(bytes(StoredSource.objects.get(key__endswith='page-1.png').content), PNG)
