"""Bước 1 gỡ Chế độ Test: xóa dữ liệu của các vùng Test (bản sao thử, không phải dữ liệu thật).

Tách khỏi bước đổi cấu trúc bảng (0007) để PostgreSQL không gộp thao tác xóa dữ liệu
và ALTER TABLE vào cùng một giao dịch.
"""
from django.db import migrations


def delete_test_states(apps, schema_editor):
    LegacyState = apps.get_model('assessment', 'LegacyState')
    LegacyStateVersion = apps.get_model('assessment', 'LegacyStateVersion')
    StoredSource = apps.get_model('assessment', 'StoredSource')
    test_states = LegacyState.objects.filter(is_test_mode=True)
    LegacyStateVersion.objects.filter(state__in=test_states).delete()
    StoredSource.objects.filter(state__in=test_states).delete()
    test_states.delete()


class Migration(migrations.Migration):
    dependencies = [('assessment', '0005_legacystate_test_mode')]
    operations = [
        migrations.RunPython(delete_test_states, migrations.RunPython.noop),
    ]
