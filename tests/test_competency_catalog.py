import copy
import hashlib
import json
import unittest
from types import SimpleNamespace
from bank_service import ServiceError
from matrix_fixtures import MatrixFixture, minimal_matrix
from matrices.model import matrix_digest, validate_matrix, CONTENT_FIELDS
from matrices.exchange import export_package, import_package
from matrices.http import handle_matrix_get, handle_matrix_post


def catalog():
    return dict(competencies=[dict(code='CUSTOM', name='Năng lực minh họa')],
                indicators=[dict(code='I1', competency='CUSTOM', text='Chỉ báo minh họa')])


class CompetencyCatalogTests(MatrixFixture, unittest.TestCase):
    def setUp(self):
        self.setup_services()

    def test_subject_revision_and_atomic_rejection(self):
        self.assertIsNone(self.matrices.get_catalog())
        saved = self.matrices.save_catalog(catalog(), 0)
        self.assertEqual(saved, dict(catalog(), subject_name='Tin học', revision=1))
        before = self.bank.bank_path.read_bytes()
        for expected in (0, True, None):
            with self.assertRaises(ServiceError): self.matrices.save_catalog(catalog(), expected)
        for field, row in [('competencies', dict(code='CUSTOM', name='Trùng')),
                           ('indicators', dict(code='I1', competency='CUSTOM', text='Trùng')),
                           ('indicators', dict(code='I2', competency='OTHER', text='Sai nhóm')),
                           ('competencies', dict(code='X', name=' ')),
                           ('indicators', dict(code='I2', competency='CUSTOM', text=' '))]:
            bad = catalog(); bad[field].append(row)
            with self.assertRaises(ServiceError): self.matrices.save_catalog(bad, 1)
        self.assertEqual(self.bank.bank_path.read_bytes(), before)
        self.bank.context['subject_name'] = '__proto__'
        self.assertIsNone(self.matrices.get_catalog())
        self.matrices.save_catalog(catalog(), 0)
        rows = self.bank._load_bank()['competency_catalogs']
        self.assertIsInstance(rows, list)
        self.assertEqual(len(rows), 2)
        self.bank.context.clear()
        self.assertEqual(self.matrices.get_catalog(), saved)
        self.assertEqual(self.matrices.save_catalog(catalog(), 1)['revision'], 2)

    def test_snapshot_digest_validation_and_exchange(self):
        m = minimal_matrix()
        legacy = hashlib.sha256(json.dumps({k:m.get(k) for k in CONTENT_FIELDS}, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(matrix_digest(m), legacy)
        m.update(competency_catalog=catalog()['competencies'], catalog_revision=1,
                 indicator_catalog=catalog()['indicators'])
        m['requirements'][0]['competency'] = 'CUSTOM'
        m['slots'][0]['parts'][0]['indicator'] = 'I1'
        self.assertTrue(validate_matrix(m, self.ppct)['valid'])
        self.assertNotEqual(matrix_digest(m), legacy)
        saved = self.matrices.save_draft(m, 0)
        self.assertEqual(saved['competency_catalog'], m['competency_catalog'])
        package = export_package(saved)
        self.assertEqual(package['matrix']['catalog_revision'], 1)
        self.assertEqual(import_package(package, self.matrices)['id'], saved['id'])
        locked = self.matrices.lock(saved['id'], saved['revision'], __import__('matrix_fixtures').confirmation())
        self.matrices.save_catalog(catalog(), 0)
        self.assertEqual(self.matrices.get(saved['id']), locked)
        for field, value in [('competency_catalog', [dict(code='CUSTOM',name='')]),
                             ('competency_catalog', m['competency_catalog'] * 2),
                             ('indicator_catalog', m['indicator_catalog'] * 2),
                             ('indicator_catalog', [dict(code='I1',competency='NLa',text='Sai')]),
                             ('catalog_revision', True)]:
            bad = copy.deepcopy(m); bad[field] = value
            self.assertFalse(validate_matrix(bad,self.ppct)['valid'], field)
            with self.assertRaises(ServiceError): self.matrices.save_draft(bad,0)

    def test_shared_routes(self):
        responses=[]
        handler=SimpleNamespace(server=SimpleNamespace(matrix_service=self.matrices), _json=responses.append)
        self.assertTrue(handle_matrix_get(handler,'/api/matrices/catalog',{}))
        self.assertEqual(responses.pop(), {'catalog':None})
        self.assertTrue(handle_matrix_post(handler,'/api/matrices/catalog/save',dict(catalog=catalog(),expected_revision=0)))
        self.assertEqual(responses.pop()['catalog']['revision'],1)

    def test_package_import_into_other_bank_retains_snapshot(self):
        m=minimal_matrix()
        m.update(competency_catalog=catalog()['competencies'],catalog_revision=3,
                 indicator_catalog=catalog()['indicators'])
        m['requirements'][0]['competency']='CUSTOM'
        m['slots'][0]['parts'][0]['indicator']='I1'
        saved=self.matrices.save_draft(m,0)
        package=export_package(saved)
        self.bank._atomic_save(self.matrices.path,[])
        imported=import_package(package,self.matrices)
        self.assertEqual(imported['competency_catalog'],m['competency_catalog'])
        self.assertEqual(imported['catalog_revision'],3)
        self.assertTrue(self.matrices.review(imported['id'])['valid'])

    def test_storage_adapter_and_concurrent_writes(self):
        from concurrent.futures import ThreadPoolExecutor
        from bank_service import BankService
        from matrices.service import MatrixService
        documents={str(self.bank.bank_path):self.bank._load_bank()}
        class Storage:
            def read(self,path,default=None):
                return copy.deepcopy(documents.get(str(path),default))
            def save(self,path,value):
                documents[str(path)]=copy.deepcopy(value)
        bank=BankService(self.bank.bank_path,self.bank.data_dir,storage=Storage(),context={'subject_name':'Môn minh họa'})
        service=MatrixService(bank)
        def save(_):
            try: return service.save_catalog(catalog(),0)['revision']
            except ServiceError as exc: return exc.status
        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertEqual(sorted(executor.map(save,range(2))),[1,409])
        fresh=MatrixService(BankService(bank.bank_path,bank.data_dir,storage=Storage(),context=bank.context))
        self.assertEqual(fresh.get_catalog()['subject_name'],'Môn minh họa')
        self.assertNotIn('competency_catalogs',self.bank._load_bank())

    def test_library_limits_and_nfc_normalization(self):
        import unicodedata
        for field in ('competencies','indicators'):
            for rows in ([], [dict(code=str(i),name='Tên',competency='CUSTOM',text='Mô tả') for i in range(2001)]):
                bad=catalog();bad[field]=rows
                with self.assertRaises(ServiceError):self.matrices.save_catalog(bad,0)
        value=catalog()
        value['competencies'][0].update(code='NĂNG',name='Năng lực')
        value['indicators'][0].update(competency='NĂNG',text='Mô tả')
        value={k:[{f:unicodedata.normalize('NFD',v) for f,v in row.items()} for row in rows] for k,rows in value.items()}
        saved=self.matrices.save_catalog(value,0)
        self.assertEqual(saved['competencies'][0]['code'],'NĂNG')
        self.assertEqual(saved['indicators'][0]['competency'],'NĂNG')

    def test_snapshot_thcs_mapping_and_positive_revision_legacy_compatibility(self):
        m=minimal_matrix()
        m['indicator_catalog']=[dict(code='OLD',competency='LEGACY')]
        self.assertTrue(validate_matrix(m,self.ppct)['valid'])
        m.update(competency_catalog=catalog()['competencies'],catalog_revision=1,indicator_catalog=catalog()['indicators'])
        m['requirements'][0]['competency']='CUSTOM'
        m['slots'][0]['parts'][0]['indicator']='WRONG'
        self.assertFalse(validate_matrix(m,self.ppct)['valid'])
        m['slots'][0]['parts'][0]['indicator']='I1'
        self.assertTrue(validate_matrix(m,self.ppct)['valid'])
        m['catalog_revision']=0
        self.assertFalse(validate_matrix(m,self.ppct)['valid'])

    def test_docx_custom_catalog_has_generic_rows_and_names(self):
        import io
        from docx import Document
        from matrices.exports import export_matrix
        m=minimal_matrix()
        m.update(profile='THPT', competency_catalog=catalog()['competencies'],catalog_revision=1,indicator_catalog=catalog()['indicators'])
        m['requirements'][0]['competency']='CUSTOM'
        m['slots'][0]['parts'][0]['indicator']='I1'
        raw,_,_=export_matrix(m,self.ppct,'docx','competencies')
        doc=Document(io.BytesIO(raw))
        cells=[[c.text for c in row.cells] for table in doc.tables for row in table.rows]
        self.assertIn(['Dạng','Câu','Ý','Mức','Năng lực','Mã'],cells)
        text=' '.join(' '.join(row) for row in cells)
        self.assertIn('Năng lực minh họa',text)
        self.assertIn('CUSTOM',text)
        self.assertIn('I1',text)

    def test_snapshot_explicit_indicator_requires_mapping_even_without_catalog(self):
        m=minimal_matrix()
        m.update(competency_catalog=catalog()['competencies'],catalog_revision=1)
        m['requirements'][0]['competency']='CUSTOM'
        m['slots'][0]['parts'][0]['indicator']='UNKNOWN'
        self.assertFalse(validate_matrix(m,self.ppct)['valid'])

    def test_question_import_preserves_separate_catalogs_and_ignores_incoming_catalogs(self):
        saved=self.matrices.save_catalog(catalog(),0)
        questions=self.bank._load_bank()['questions']
        for extra in ({},{'competency_catalogs':[]},{'competency_catalogs':[dict(subject_name='Tin học',revision=99)]}):
            result=self.bank.import_bank(dict(questions=questions,**extra))
            self.assertEqual(self.matrices.get_catalog(),saved)
            self.assertEqual(result['competency_catalogs'],[saved])
        del_catalog_bank=copy.deepcopy(self.bank._load_bank())
        del_catalog_bank.pop('competency_catalogs')
        self.bank._atomic_save(self.bank.bank_path,del_catalog_bank)
        self.bank.import_bank(dict(questions=questions,competency_catalogs=[saved]))
        self.assertIsNone(self.matrices.get_catalog())

    def test_received_snapshot_cannot_change_without_override(self):
        m=minimal_matrix()
        m.update(competency_catalog=catalog()['competencies'],catalog_revision=1,
                 indicator_catalog=catalog()['indicators'],source={'sha256':'a'*64})
        m['requirements'][0]['competency']='CUSTOM'
        m['slots'][0]['parts'][0]['indicator']='I1'
        received=self.matrices.insert_received(m)
        for field,value in [('catalog_revision',2),('competency_catalog',[dict(code='CUSTOM',name='Tên đã đổi')])]:
            changed=copy.deepcopy(received);changed[field]=value
            with self.assertRaises(ServiceError):self.matrices.save_draft(changed,received['revision'])
            self.assertEqual(self.matrices.get(received['id']),received)
        for field in ('competency_catalog','catalog_revision'):
            changed=copy.deepcopy(received);changed.pop(field)
            with self.assertRaises(ServiceError):self.matrices.save_draft(changed,received['revision'])
        changed=copy.deepcopy(received)
        changed.pop('competency_catalog');changed.pop('catalog_revision')
        changed['requirements'][0]['competency']='NLa'
        changed['indicator_catalog']=[]
        with self.assertRaises(ServiceError):self.matrices.save_draft(changed,received['revision'])
        changed=copy.deepcopy(received);changed['catalog_revision']=2;changed['allow_custom_override']=True
        self.assertEqual(self.matrices.save_draft(changed,received['revision'])['catalog_revision'],2)

    def test_received_legacy_core_has_no_optional_snapshot_keys(self):
        from matrices.service import received_core
        legacy=received_core(minimal_matrix())
        self.assertNotIn('competency_catalog',legacy)
        self.assertNotIn('catalog_revision',legacy)
        self.assertEqual(set(legacy),{'profile','grade','exam_type','total_points','duration','source','lessons','requirements','slots','indicator_catalog','issues'})
