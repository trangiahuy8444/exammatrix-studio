"""Bước 2 gỡ Chế độ Test: bỏ cột is_test_mode và đưa ràng buộc duy nhất về mỗi tài khoản/khóa học một ngân hàng."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('assessment', '0006_delete_test_mode_states')]
    operations = [
        migrations.RemoveConstraint(model_name='legacystate', name='one_original_bank_per_workspace'),
        migrations.RemoveConstraint(model_name='legacystate', name='one_bank_per_curriculum'),
        migrations.RemoveField(model_name='legacystate', name='is_test_mode'),
        migrations.AddConstraint(model_name='legacystate', constraint=models.UniqueConstraint(
            fields=['workspace'], condition=models.Q(curriculum__isnull=True), name='one_original_bank_per_workspace')),
        migrations.AddConstraint(model_name='legacystate', constraint=models.UniqueConstraint(
            fields=['workspace', 'curriculum'], name='one_bank_per_curriculum')),
    ]
