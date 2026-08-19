from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("repositories", "0005_codechunk_codesymbol_repositorie_parsing_66d9ac_idx_and_more")]

    operations = [
        migrations.AddField(
            model_name="repository",
            name="ingestion_stage",
            field=models.CharField(default="queued", max_length=32),
        ),
    ]
