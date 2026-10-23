from django import forms
from .models import Subject, Curriculum
from .access import owned


class SubjectForm(forms.ModelForm):
    class Meta:
        model = Subject
        fields = ['name', 'code']
        labels = {'name': 'Tên môn học', 'code': 'Mã môn (ví dụ: toan, tin-hoc)'}


class CurriculumForm(forms.ModelForm):
    class Meta:
        model = Curriculum
        fields = ['subject', 'title', 'grade', 'school_year', 'book']
        labels = {'subject': 'Môn học', 'title': 'Tên chương trình', 'grade': 'Khối lớp',
                  'school_year': 'Năm học', 'book': 'Bộ sách (nếu có)'}

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['subject'].queryset = owned(Subject.objects.filter(archived=False), user)


class QuickStartForm(forms.Form):
    SUBJECTS = [('toan', 'Toán'), ('ngu-van', 'Ngữ văn'), ('tieng-anh', 'Tiếng Anh'),
                ('tin-hoc', 'Tin học'), ('vat-li', 'Vật lí'), ('hoa-hoc', 'Hóa học'),
                ('sinh-hoc', 'Sinh học'), ('lich-su', 'Lịch sử'), ('dia-li', 'Địa lí'),
                ('khoa-hoc-tu-nhien', 'Khoa học tự nhiên')]
    subject = forms.ChoiceField(label='Môn bạn dạy', choices=SUBJECTS)
    grade = forms.TypedChoiceField(label='Khối lớp', coerce=int,
                                  choices=[(g, f'Khối {g}') for g in range(1, 13)], initial=12)
    school_year = forms.CharField(label='Năm học', initial='2026-2027', max_length=9)
    book = forms.CharField(label='Bộ sách (nếu có)', required=False, max_length=150)

    def clean_school_year(self):
        value = self.cleaned_data['school_year']
        import re
        if not re.fullmatch(r'\d{4}-\d{4}', value) or int(value[5:]) != int(value[:4])+1:
            raise forms.ValidationError('Nhập hai năm liên tiếp, ví dụ 2026-2027.')
        return value

    def save(self, workspace):
        data = self.cleaned_data
        subject, _ = Subject.objects.get_or_create(workspace=workspace, code=data['subject'],
            defaults={'name': dict(self.SUBJECTS)[data['subject']]})
        if subject.archived:
            raise forms.ValidationError('Môn học đang trong thùng rác. Hãy khôi phục môn trước khi tạo chương trình.')
        return Curriculum.objects.create(workspace=workspace, subject=subject, grade=data['grade'],
            title=f'{subject.name} {data["grade"]}', school_year=data['school_year'], book=data['book'])
