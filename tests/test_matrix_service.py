import copy
import unittest
from matrix_fixtures import MatrixFixture, minimal_matrix, confirmation
from bank_service import ServiceError
try:
    from matrices.service import MatrixService
except ImportError:
    MatrixService=None


class MatrixServiceTests(MatrixFixture,unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(MatrixService,'Matrix service must be implemented')
        self.setup_services()

    def test_stale_tab_never_overwrites_newer_edit(self):
        old=self.matrices.save_draft(minimal_matrix(),0)
        self.matrices.save_draft(dict(old,title='Đã sửa'),old['revision'])
        with self.assertRaises(ServiceError) as ctx:self.matrices.save_draft(old,old['revision'])
        self.assertEqual(ctx.exception.status,409)
        self.assertEqual(self.matrices.get(old['id'])['title'],'Đã sửa')

    def test_locked_cannot_edit_and_new_version_preserves_old(self):
        locked=self.locked_matrix()
        with self.assertRaises(ServiceError):self.matrices.save_draft(dict(locked,title='Ghi đè'),locked['revision'])
        with self.assertRaises(ServiceError):self.matrices.save_draft(dict(locked,status='draft'),locked['revision'])
        new=self.matrices.new_version(locked['id'])
        self.assertEqual(new['version'],2);self.assertEqual(new['previous_id'],locked['id'])
        self.assertEqual(new['status'],'draft');self.assertNotEqual(new['id'],locked['id'])
        self.assertEqual(self.matrices.get(locked['id']),locked)

    def test_lock_requires_valid_data_and_external_confirmation(self):
        m=self.matrices.save_draft(minimal_matrix(),0)
        with self.assertRaises(ServiceError):self.matrices.lock(m['id'],m['revision'],{})
        m['slots'][0]['parts'][0]['points']=9
        m=self.matrices.save_draft(m,m['revision'])
        self.assertFalse(self.matrices.review(m['id'])['valid'])
        with self.assertRaises(ServiceError):self.matrices.lock(m['id'],m['revision'],confirmation())

    def test_assigned_grade_guard_and_received_creation_guard(self):
        for grade in (8,10):
            m=minimal_matrix();m['grade']=grade
            with self.assertRaises(ServiceError):self.matrices.save_draft(m,0)
        m=minimal_matrix();m['mode']='received'
        with self.assertRaises(ServiceError):self.matrices.save_draft(m,0)

    def test_archive_keeps_record_and_backup(self):
        m=self.locked_matrix()
        archived=self.matrices.archive(m['id'],m['revision'],'Không dùng bản này cho đề mới')
        self.assertEqual(archived['status'],'archived');self.assertTrue(archived['audit'])
        self.assertTrue(list((self.bank.data_dir/'backups').glob('*.json')))
        self.assertEqual(len(self.matrices.list()),1)

    def test_malformed_arrays_and_nonfinite_values_not_written(self):
        for field,value in [('slots',None),('requirements',[None]),('total_points',float('nan'))]:
            m=minimal_matrix();m[field]=value
            with self.assertRaises(ServiceError):self.matrices.save_draft(m,0)
        self.assertEqual(self.matrices.list(),[])
