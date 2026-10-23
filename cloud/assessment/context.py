"""The course belongs to a URL/tab, never a shared 'last selected' session."""
from django.http import Http404
from workspace.access import get_owned
from workspace.models import Curriculum, subject_competencies

MATH_COMPETENCIES = ['TDLL', 'MHH', 'GQVĐ', 'GT', 'SDCC']


def selected_course(request):
    ident = request.GET.get('curriculum')
    if not ident or ident == 'legacy':
        return None
    course = get_owned(Curriculum.objects.select_related('subject'), request.user, ident)
    if course.archived:
        raise Http404()
    return course


def course_context(course):
    if course is None:
        return {'subject_name': 'Tin học', 'allowed_grades': [8, 9, 10], 'school_profile': True,
                'competencies': ['NLa', 'NLb', 'NLc', 'NLd', 'NLe'], 'minimum_revision_percent': 90}
    return {'curriculum_id': str(course.pk), 'subject_name': course.subject.name,
            'allowed_grades': [course.grade], 'school_year': course.school_year,
            'school_profile': course.policy.get('id') == 'asian-school',
            'competencies': course.policy.get('competencies') or course.subject.competencies or subject_competencies(course.subject.name, course.subject.code),
            'policy': course.policy, 'minimum_revision_percent': course.policy.get('minimum_revision_percent', 90),
            'title': course.title}
