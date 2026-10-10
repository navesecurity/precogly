"""Nave: restore dismissal and map control_type onto upstream's new fields.

Runs after upstream 0014. Dismissal columns are renamed back to their original
names so the API contract Neurex reads is unchanged. A dismissed threat is
mirrored onto triage_status=eliminate (with its reason as the rationale) so
upstream's reports and counts treat it as inactive. Unmapped control_type values
raise instead of being dropped.
"""

from django.db import migrations
from django.db.models import F

FUNCTIONS = {"preventive", "detective", "corrective", "deterrent", "recovery", "compensating"}


def restore(apps, schema_editor):
    for name in ("ComponentInstanceThreat", "DataFlowInstanceThreat"):
        model = apps.get_model("threats", name)
        model.objects.filter(is_dismissed=True, triage_status="open").update(
            triage_status="eliminate"
        )
        model.objects.filter(is_dismissed=True, decision_rationale="").update(
            decision_rationale=F("dismissal_reason")
        )
    for name in ("CountermeasureLibrary", "InstanceCountermeasure"):
        model = apps.get_model("threats", name)
        values = set(
            model.objects.exclude(nave_control_type="").values_list(
                "nave_control_type", flat=True
            )
        )
        for value in values:
            rows = model.objects.filter(nave_control_type=value)
            if value in FUNCTIONS:
                rows.filter(control_functions=[]).update(control_functions=[value])
            elif value == "procedural":
                rows.filter(control_nature="").update(control_nature="administrative")
            else:
                raise RuntimeError(f"Unmapped control_type {value!r}; refusing to drop it")


class Migration(migrations.Migration):
    dependencies = [
        ("threats", "0013_nave_stash_before_triage"),
        ("threats", "0014_remove_componentinstancethreat_dismissal_reason_and_more"),
    ]

    operations = [
        *[
            migrations.RenameField(model, old, new)
            for model in ("componentinstancethreat", "dataflowinstancethreat")
            for old, new in (
                ("nave_is_dismissed", "is_dismissed"),
                ("nave_dismissal_reason", "dismissal_reason"),
            )
        ],
        migrations.RunPython(restore, migrations.RunPython.noop),
        migrations.RemoveField("countermeasurelibrary", "nave_control_type"),
        migrations.RemoveField("instancecountermeasure", "nave_control_type"),
    ]
