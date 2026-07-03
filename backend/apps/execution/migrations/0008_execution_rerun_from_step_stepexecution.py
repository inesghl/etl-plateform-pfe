from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("execution", "0007_execution_hidden_by_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="execution",
            name="rerun_from_step",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="StepExecution",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("step_order", models.IntegerField()),
                ("step_name", models.CharField(max_length=200)),
                ("script", models.CharField(max_length=500)),
                ("status", models.CharField(
                    choices=[
                        ("PENDING", "Pending"),
                        ("RUNNING", "Running"),
                        ("SUCCESS", "Success"),
                        ("FAILED", "Failed"),
                        ("SKIPPED", "Skipped"),
                    ],
                    default="PENDING",
                    max_length=20,
                )),
                ("resolved_inputs", models.JSONField(blank=True, default=dict)),
                ("output_snapshot_path", models.CharField(blank=True, max_length=1000)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("return_code", models.IntegerField(blank=True, null=True)),
                ("stdout_log", models.TextField(blank=True)),
                ("stderr_log", models.TextField(blank=True)),
                ("rerun_count", models.IntegerField(default=0)),
                ("execution", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="step_executions",
                    to="execution.execution",
                )),
            ],
            options={
                "db_table": "step_executions",
                "ordering": ["step_order"],
                "app_label": "execution",
            },
        ),
        migrations.AlterUniqueTogether(
            name="stepexecution",
            unique_together={("execution", "step_order")},
        ),
    ]
