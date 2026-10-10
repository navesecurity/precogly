"""Nave: copy dismissal and control_type data aside before upstream 0014 drops it.

Upstream 0014_remove_componentinstancethreat_dismissal_reason_and_more removes
`is_dismissed`, `dismissal_reason` and `control_type` with no data migration.
`run_before` forces this to run first on every database, so a plain `migrate`
(which the container's start command runs) cannot reach 0014 without it.

This also merges the two 0013 branches: upstream's instance_threat_taxonomy_entry
and Nave's already-applied verification-fields migration.
"""

from django.db import migrations, models
from django.db.models import F

UPSTREAM_REMOVAL = "0014_remove_componentinstancethreat_dismissal_reason_and_more"
DISMISS_HELP = "Dismissed threats are hidden from active view but preserved for audit"
REASON_HELP = "Reason for dismissing the threat"


def stash(apps, schema_editor):
    for name in ("ComponentInstanceThreat", "DataFlowInstanceThreat"):
        apps.get_model("threats", name).objects.update(
            nave_is_dismissed=F("is_dismissed"),
            nave_dismissal_reason=F("dismissal_reason"),
        )
    for name in ("CountermeasureLibrary", "InstanceCountermeasure"):
        apps.get_model("threats", name).objects.update(
            nave_control_type=F("control_type")
        )


class Migration(migrations.Migration):
    dependencies = [
        ("threats", "0013_instance_threat_taxonomy_entry"),
        ("threats", "0013_add_verification_procedure_expected_result"),
    ]
    run_before = [("threats", UPSTREAM_REMOVAL)]

    operations = [
        *[
            op
            for model in ("componentinstancethreat", "dataflowinstancethreat")
            for op in (
                migrations.AddField(
                    model_name=model,
                    name="nave_is_dismissed",
                    field=models.BooleanField(default=False, help_text=DISMISS_HELP),
                ),
                migrations.AddField(
                    model_name=model,
                    name="nave_dismissal_reason",
                    field=models.TextField(blank=True, default="", help_text=REASON_HELP),
                ),
            )
        ],
        *[
            migrations.AddField(
                model_name=model,
                name="nave_control_type",
                field=models.CharField(blank=True, default="", max_length=50),
            )
            for model in ("countermeasurelibrary", "instancecountermeasure")
        ],
        migrations.RunPython(stash, migrations.RunPython.noop),
    ]
