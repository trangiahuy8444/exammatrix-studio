"""Install sample packs through the existing services, without replacing user work."""
import copy

from domain.review import CHECKLIST
from django.db import transaction
from workspace.access import workspace_for
from workspace.models import Workspace, Subject, Curriculum, AuditEvent
from assessment.legacy_storage import bank_for_user
from matrices.service import MatrixService
from matrices.model import validate_matrix
from bank_service import ServiceError
from .content import PACKS

SAMPLE_REVIEWER = 'Dữ liệu mẫu (tự động)'

LEVELS = ['Biết', 'Hiểu', 'Vận dụng']


def sample_matrix(pack, lessons, owner):
    requirements = []
    blueprint = []
    slots = []
    numbers = {'MC': 0, 'ES': 0}
    for lesson in lessons:
        for index, level in enumerate(LEVELS):
            req_id = lesson['code']+'-'+str(index)
            requirements.append(dict(id=req_id, lesson_code=lesson['code'], level=level,
                text=lesson['outcomes'][index], competency=pack['competency'], ppct_outcome_index=index))
            count = 2 if level == 'Biết' else 1
            blueprint.append(dict(lesson_code=lesson['code'], type='MC', level=level,
                                  count=count, points_per_question=0.5))
            for _ in range(count):
                numbers['MC'] += 1
                ident = f'MC-{numbers["MC"]}'
                slots.append(dict(id=ident, kind='MC', number=numbers['MC'], scoring={'mode':'sum_parts'},
                    parts=[dict(id=ident+'-P', label='', requirement_id=req_id, points=0.5, indicator='')]))
    for lesson_code, level in [('B1', 'Hiểu'), ('B2', 'Vận dụng')]:
        numbers['ES'] += 1
        ident = f'ES-{numbers["ES"]}'
        blueprint.append(dict(lesson_code=lesson_code, type='ES', level=level, count=1, points_per_question=2))
        slots.append(dict(id=ident, kind='ES', number=numbers['ES'], scoring={'mode':'sum_parts'},
            parts=[dict(id=ident+'-P', label='', requirement_id=lesson_code+'-'+str(LEVELS.index(level)),
                        points=2, indicator='')]))
    matrix = dict(title=f'[Mẫu] Ma trận {pack["name"]} 10 — 10 điểm', profile='GENERAL', grade=10,
        mode='authored', school_year='2026-2027', exam_type='TX', duration=45,
        owner_name=owner.username, campus='Bộ dữ liệu minh họa', total_points=10,
        lessons=[dict(lesson_code=l['code'], title=l['name'], topic=l['topic']) for l in lessons],
        requirements=requirements, slots=slots, indicator_catalog=[], reconciliation={'confirmed':True,'issues':[]})
    return matrix, blueprint


@transaction.atomic
def seed_samples(user):
    workspace = workspace_for(user)
    Workspace.objects.select_for_update().get(pk=workspace.pk)
    results = []
    for pack in PACKS:
        existing = Curriculum.objects.filter(workspace=workspace, policy__sample_pack=pack['marker']).first()
        if existing:
            results.append(dict(status='unchanged', name=pack['name'], curriculum_id=str(existing.pk)))
            continue
        subject, _ = Subject.objects.get_or_create(workspace=workspace, code=pack['code'], defaults={'name':pack['name']})
        course = Curriculum.objects.create(workspace=workspace, subject=subject, grade=10,
            title=f'[Mẫu] {pack["name"]} 10 — thử tạo đề', school_year='2026-2027',
            book='Dữ liệu minh họa tự biên soạn; không thay thế chương trình chính thức',
            policy=dict(id='general', minimum_revision_percent=90, total_points=10,
                        competencies=(["TDLL", "MHH", "GQVĐ", "GT", "SDCC"] if pack['code']=='toan' else ['NL_CHUNG']),
                        sample_pack=pack['marker']))
        bank = bank_for_user(user, course)
        for order, lesson in enumerate(pack['lessons'], 1):
            bank.save_ppct_lesson(dict(grade=10, lesson_code=lesson['code'],
                lesson_name_source=lesson['name'], topic_source=lesson['topic'], outcomes=lesson['outcomes'],
                week_raw=f'Bài mẫu {order}', periods_raw='Không ấn định'))
            for raw in lesson['questions']:
                question = copy.deepcopy(raw)
                question.update(grade=10, lesson_code=lesson['code'], max_score=1,
                    learning_outcome=lesson['outcomes'][LEVELS.index(raw['level'])],
                    review_status='draft', source_file='Dữ liệu mẫu tự biên soạn — dùng thử chức năng')
                saved = bank.save_question(question)
                # Bộ mẫu chỉ để thử chức năng tạo đề: đi qua đúng quy trình duyệt (B1), lịch sử ghi rõ là tự động.
                bank.review_question(saved['id'], 'submit', actor=SAMPLE_REVIEWER)
                bank.review_question(saved['id'], 'approve', actor=SAMPLE_REVIEWER,
                                     checklist={item['key']: True for item in CHECKLIST},
                                     reason='Dữ liệu mẫu tự biên soạn; không dùng cho kiểm tra chính thức.')
        doc = bank._load_bank()
        doc['metadata'].update(sample_pack=pack['marker'], sample_notice='Dữ liệu minh họa; giáo viên rà soát trước khi dùng kiểm tra chính thức.')
        bank._atomic_save(bank.bank_path, doc)
        revision = bank.save_revision(dict(title=f'[Mẫu] Đề cương {pack["name"]} 10 — 24 câu',
            grade=10, question_ids=[q['id'] for q in doc['questions']]))
        matrix, blueprint = sample_matrix(pack, pack['lessons'], user)
        matrices = MatrixService(bank, authored_grades=(10,))
        saved = matrices.save_draft(matrix, expected_revision=0)
        report = validate_matrix(saved['matrix'] if 'matrix' in saved else saved, bank.catalog)
        if not report['valid']:
            raise ServiceError('Ma trận mẫu không đạt kiểm tra.', report)
        exam = bank.generate_exam(dict(title=f'[Mẫu] Đề {pack["name"]} 10 — 45 phút', grade=10,
            exam_type='TX', duration=45, seed=pack['marker'], revision_id=revision['id'],
            blueprint=blueprint, similarity_percent=100, similarity_mode='min'))
        AuditEvent.objects.create(workspace=workspace, actor=user, action='sample_pack_created', object_id=str(course.pk),
            details=dict(marker=pack['marker'], questions=24, revision_id=revision['id'], exam_id=exam['id']))
        results.append(dict(status='created', name=pack['name'], curriculum_id=str(course.pk), questions=24))
    return results
