import copy
import unittest
from matrix_fixtures import MatrixFixture
from bank_service import ServiceError
try:
    from matrices.exchange import export_package,import_package
except ImportError:
    export_package=import_package=None


class MatrixExchangeTests(MatrixFixture,unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(export_package,'Package exchange must be implemented')
        self.setup_services()

    def test_roundtrip_is_idempotent_and_never_exposes_private_fields(self):
        m=self.locked_matrix();m['bank']={'correct':1};m['local_path']='/Users/private/source.docx'
        m['requirements'][0]['options']=['Private option']
        p=export_package(m)
        self.assertNotIn('local_path',str(p));self.assertNotIn('correct',str(p))
        self.assertNotIn('Private option',str(p))
        self.assertEqual(import_package(p,self.matrices)['id'],m['id'])
        self.assertEqual(len(self.matrices.list()),1)

    def test_modified_content_same_identifier_or_bad_hash_rejected(self):
        m=self.locked_matrix();p=export_package(m);p['matrix']['title']='Bị sửa'
        with self.assertRaises(ServiceError):import_package(p,self.matrices)
        other=copy.deepcopy(m);other['title']='Cùng mã khác nội dung';p=export_package(other)
        with self.assertRaises(ServiceError):import_package(p,self.matrices)
        p=export_package(m);p['schema_version']=99
        with self.assertRaises(ServiceError):import_package(p,self.matrices)

    def test_foreign_package_id_is_retained_for_collision_checks(self):
        from matrices.service import MatrixService
        from bank_service import BankService
        other=MatrixService(BankService(self.bank.bank_path,self.root/'other'))
        m=self.locked_matrix();package=export_package(m)
        got=import_package(package,other)
        self.assertEqual(import_package(package,other)['id'],got['id'])
        changed=copy.deepcopy(m);changed['title']='Different foreign content'
        with self.assertRaises(ServiceError):import_package(export_package(changed),other)

    def test_received_package_cannot_reassign_between_levels(self):
        from matrices.service import MatrixService
        from bank_service import BankService
        m=self.locked_matrix();m['requirements'].append(dict(m['requirements'][0],id='R2',level='Hiểu',ppct_outcome_index=1))
        other=MatrixService(BankService(self.bank.bank_path,self.root/'other'))
        got=import_package(export_package(m),other)
        self.assertIsNotNone(got['requirements'][0].get('source_index'))
        got['slots'][0]['parts'][0]['requirement_id']='R2'
        with self.assertRaises(ServiceError):other.save_draft(got,got['revision'])

    def test_distinct_versions_sharing_word_source_remain_distinct(self):
        from matrices.service import MatrixService
        from bank_service import BankService
        other=MatrixService(BankService(self.bank.bank_path,self.root/'other'))
        m=self.locked_matrix();m.update(id='FOREIGN-1',family_id='FAMILY-FOREIGN',version=4)
        m['source']=dict(name='source.docx',sha256='a'*64,tables=[],notes=[])
        first=import_package(export_package(m),other)
        second=copy.deepcopy(m);second.update(id='FOREIGN-2',version=5,previous_id='FOREIGN-1',title='Bản tiếp theo')
        later=import_package(export_package(second),other)
        self.assertNotEqual(first['id'],later['id']);self.assertEqual(later['version'],5)
        self.assertEqual(later['family_id'],first['family_id']);self.assertEqual(later['previous_id'],first['id'])
        self.assertEqual(later['import_origin']['external_version'],5)
