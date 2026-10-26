from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('assessment', '0004_storedsource')]
    operations = [
        migrations.RemoveConstraint(model_name='legacystate', name='one_original_bank_per_workspace'),
        migrations.RemoveConstraint(model_name='legacystate', name='one_bank_per_curriculum'),
        migrations.AddField(model_name='legacystate', name='is_test_mode', field=models.BooleanField(default=False)),
        migrations.AddConstraint(model_name='legacystate', constraint=models.UniqueConstraint(
            fields=['workspace', 'is_test_mode'], condition=models.Q(curriculum__isnull=True), name='one_original_bank_per_workspace')),
        migrations.AddConstraint(model_name='legacystate', constraint=models.UniqueConstraint(
            fields=['workspace', 'curriculum', 'is_test_mode'], name='one_bank_per_curriculum')),
    ]
