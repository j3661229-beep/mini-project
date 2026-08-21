from django.db import migrations


def backfill(apps, schema_editor):
    Repository = apps.get_model("repositories", "Repository")
    Repository.objects.filter(status="complete", ingestion_stage="queued").update(ingestion_stage="complete")
    Repository.objects.filter(status="failed", ingestion_stage="queued").update(ingestion_stage="failed")


class Migration(migrations.Migration):
    dependencies = [("repositories", "0006_repository_ingestion_stage")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
