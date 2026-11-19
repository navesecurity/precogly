"""A pack is connected to a threat model only where the rules in apps/packs/auto_connect.py allow.

Regression for upstream behaviour that connected every pack to every threat model on catalog
sync, single import and model creation. A pack can hold one client's content, so that put
another client's threats on a model that had nothing to do with it.
"""

from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationMember, Team
from apps.packs.models import LibraryPack
from apps.threat_models.models import ThreatModel, ThreatModelLibraryPack

User = get_user_model()


def make_pack(slug):
    return LibraryPack.objects.create(
        slug=slug,
        name=slug,
        description="test pack",
        pack_type=LibraryPack.PackType.TECHNOLOGY,
        version="1.0.0",
        author="test",
    )


def make_model(org, name):
    team, _ = Team.objects.get_or_create(
        organization=org, name="Security Team", defaults={"is_default": True}
    )
    return ThreatModel.objects.create(
        organization=org,
        owning_team=team,
        name=name,
        description="test",
        criticality=ThreatModel.Criticality.MEDIUM,
    )


def connected(threat_model):
    return set(
        ThreatModelLibraryPack.objects.filter(threat_model=threat_model).values_list(
            "library_pack__slug", flat=True
        )
    )


class PackAutoConnectTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organization.objects.create(name="Org A", domain="a.test", is_primary=False)
        cls.org_b = Organization.objects.create(name="Org B", domain="b.test", is_primary=False)
        cls.user = User.objects.create_user(
            username="sec", email="sec@example.com", password="x"
        )
        OrganizationMember.objects.create(
            organization=cls.org_a, user=cls.user, role="security_team"
        )
        cls.model_a = make_model(cls.org_a, "Model in A")
        cls.model_b = make_model(cls.org_b, "Model in B")
        cls.general = make_pack("general-pack")
        cls.client_pack = make_pack("one-clients-pack")
        cls.api = APIClient()
        cls.api.force_authenticate(cls.user)

    def _sync(self, body=None):
        results = [SimpleNamespace(
            success=True, pack_slug="one-clients-pack", to_dict=lambda: {"pack_slug": "one-clients-pack"}
        )]
        with patch("apps.packs.views.sync_all_packs_from_source", return_value=results):
            return self.api.post("/api/packs/sync_from_source/", body or {}, format="json")

    def _import(self, body=None):
        info = SimpleNamespace(slug="one-clients-pack", path="/nowhere")
        ok = SimpleNamespace(success=True, to_dict=lambda: {"success": True})
        with patch("apps.packs.views.discover_packs_from_source", return_value=[info]), patch(
            "apps.packs.views.import_pack_from_path", return_value=ok
        ):
            payload = {"slug": "one-clients-pack"}
            payload.update(body or {})
            return self.api.post("/api/packs/import_single/", payload, format="json")

    def test_sync_connects_a_pack_to_no_model_by_default(self):
        self.assertEqual(self._sync().status_code, 200)
        self.assertEqual(ThreatModelLibraryPack.objects.count(), 0)

    def test_import_connects_a_pack_to_no_model_by_default(self):
        self.assertEqual(self._import().status_code, 201)
        self.assertEqual(ThreatModelLibraryPack.objects.count(), 0)

    def test_sync_connects_only_the_listed_model_in_the_requesters_org(self):
        self._sync({"threat_model_ids": [self.model_a.id, self.model_b.id]})
        self.assertEqual(connected(self.model_a), {"one-clients-pack"})
        self.assertEqual(connected(self.model_b), set())

    def test_import_connects_only_the_listed_model_in_the_requesters_org(self):
        self._import({"threat_model_ids": [self.model_a.id, self.model_b.id]})
        self.assertEqual(connected(self.model_a), {"one-clients-pack"})
        self.assertEqual(connected(self.model_b), set())

    def test_malformed_model_ids_connect_nothing(self):
        self._import({"threat_model_ids": "all"})
        self._sync({"threat_model_ids": [True, "x", None]})
        self.assertEqual(ThreatModelLibraryPack.objects.count(), 0)

    def _create_model(self):
        return self.api.post(
            "/api/threat-models/",
            {"name": "New model", "description": "x", "organization": self.org_a.id},
            format="json",
        )

    def test_creating_a_model_connects_no_pack_by_default(self):
        response = self._create_model()
        self.assertEqual(response.status_code, 201, response.content)
        new = ThreatModel.objects.get(id=response.json()["id"])
        self.assertEqual(connected(new), set())

    @override_settings(PACK_AUTO_CONNECT_SLUGS=["general-pack"])
    def test_creating_a_model_connects_only_allowlisted_packs(self):
        response = self._create_model()
        self.assertEqual(response.status_code, 201, response.content)
        new = ThreatModel.objects.get(id=response.json()["id"])
        self.assertEqual(connected(new), {"general-pack"})
        self.assertEqual(connected(self.model_a), set())
