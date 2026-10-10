"""Tests for the Nave dismissal addition (apps/threats/nave_dismissal.py)."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.organizations.models import Organization
from apps.systems.models import OrgsystemComponent
from apps.threat_models.models import ThreatModel
from apps.threats.models import ComponentInstanceThreat
from apps.threats.serializers import ComponentInstanceThreatSerializer

User = get_user_model()


class NaveDismissalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        org = Organization.objects.create(name="Dismissal Org", domain="dismissal.test")
        tm = ThreatModel.objects.create(name="Dismissal TM", organization=org)
        cls.component = OrgsystemComponent.objects.create(threat_model=tm, name="C")

    def _threat(self, **kw):
        return ComponentInstanceThreat.objects.create(
            component=self.component, inherent_severity="high", **kw
        )

    def test_dismissal_mirrors_onto_triage_and_rationale(self):
        t = self._threat()
        t.is_dismissed = True
        t.dismissal_reason = "Not applicable to this device."
        t.save()
        t.refresh_from_db()
        self.assertTrue(t.is_dismissed)
        self.assertEqual(t.triage_status, "eliminate")
        self.assertEqual(t.decision_rationale, "Not applicable to this device.")

    def test_dismissal_via_update_fields_still_mirrors(self):
        t = self._threat()
        t.is_dismissed = True
        t.dismissal_reason = "Duplicate coverage."
        t.save(update_fields=["is_dismissed", "dismissal_reason"])
        t.refresh_from_db()
        self.assertEqual(t.triage_status, "eliminate")
        self.assertEqual(t.decision_rationale, "Duplicate coverage.")

    def test_existing_rationale_is_not_overwritten(self):
        t = self._threat(decision_rationale="Analyst note.")
        t.is_dismissed = True
        t.dismissal_reason = "Mis-targeted."
        t.save()
        t.refresh_from_db()
        self.assertEqual(t.decision_rationale, "Analyst note.")

    def test_untouched_threat_stays_open_and_not_dismissed(self):
        t = self._threat()
        t.refresh_from_db()
        self.assertFalse(t.is_dismissed)
        self.assertEqual(t.triage_status, "open")

    def test_moving_triage_off_eliminate_reactivates(self):
        t = self._threat()
        t.is_dismissed = True
        t.dismissal_reason = "N/A."
        t.save()
        t = ComponentInstanceThreat.objects.get(pk=t.pk)
        t.triage_status = "mitigate"
        t.save()
        t.refresh_from_db()
        self.assertFalse(t.is_dismissed)

    def test_genuine_eliminate_is_not_a_dismissal(self):
        t = self._threat(triage_status="eliminate", decision_rationale="Removed the source.")
        t.refresh_from_db()
        self.assertFalse(t.is_dismissed)

    def test_api_serializer_exposes_dismissal_fields(self):
        t = self._threat(is_dismissed=True, dismissal_reason="N/A.")
        data = ComponentInstanceThreatSerializer(t).data
        self.assertIn("is_dismissed", data)
        self.assertIn("dismissal_reason", data)
        self.assertTrue(data["is_dismissed"])
        self.assertEqual(data["dismissal_reason"], "N/A.")
