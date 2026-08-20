"""
Tests for the countermeasure-orphan reconciliation mechanism:

- apps.packs.services.tag_successor_aliases_before_delete
- apps.packs.services._load_countermeasures's YAML-declared `aliases` merge
- the reconcile_orphaned_countermeasures management command

Three scenarios this mechanism exists for:
  1. A countermeasure moves to a different pack, name unchanged (the shape
     Nave's medtech-base -> medtech-imaging DICOM migration took) --
     caught by plain exact-name match, no aliases involved at all.
  2. A countermeasure is deleted (pack unimport) while a same-name row
     still exists elsewhere -- tag_successor_aliases_before_delete records
     that fact onto the survivor so it's still relinkable later even if
     the survivor is itself renamed again in the meantime.
  3. A countermeasure is renamed *and* moved in the same operation, with
     no name ever shared between old and new rows -- the only case that
     needs a pack author to declare the old name explicitly via YAML
     `aliases:`, since nothing in the DB alone can link them automatically.
"""

import tempfile
from io import StringIO
from pathlib import Path

import yaml
from django.core.management import call_command
from django.test import TestCase

from apps.organizations.models import Organization
from apps.packs.models import LibraryPack
from apps.packs.services import _load_countermeasures, tag_successor_aliases_before_delete
from apps.threats.models import CountermeasureLibrary, InstanceCountermeasure
from apps.threat_models.models import ThreatModel


class ReconciliationTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organization.objects.create(name="Test Org", domain="recon-test.org")
        cls.threat_model = ThreatModel.objects.create(organization=cls.org, name="Recon Test TM")

        cls.old_pack = LibraryPack.objects.create(
            slug="recon-test-old-pack",
            name="Old Pack",
            description="",
            pack_type=LibraryPack.PackType.COUNTERMEASURE,
            version="1.0.0",
            author="test",
        )
        cls.new_pack = LibraryPack.objects.create(
            slug="recon-test-new-pack",
            name="New Pack",
            description="",
            pack_type=LibraryPack.PackType.COUNTERMEASURE,
            version="1.0.0",
            author="test",
        )


class TagSuccessorAliasesTests(ReconciliationTestBase):
    def test_tags_unambiguous_same_name_successor(self):
        """A row about to be deleted, with a live instance and exactly one
        same-name row in a different pack, gets its *name* recorded onto
        that row's aliases (not the slug -- see the function's docstring:
        InstanceCountermeasure only ever copies `name`, so that's the only
        thing a future orphan can be matched against)."""
        old_row = CountermeasureLibrary.objects.create(
            source_pack=self.old_pack,
            slug="encrypt-data",
            qualified_slug="recon-test-old-pack/encrypt-data",
            name="Encrypt Sensitive Data",
            description="old description",
            control_type="preventive",
        )
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="encrypt-data",
            qualified_slug="recon-test-new-pack/encrypt-data",
            name="Encrypt Sensitive Data",
            description="new description",
            control_type="preventive",
        )
        InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=old_row,
            countermeasure_name=old_row.name,
            countermeasure_description=old_row.description,
            control_type=old_row.control_type,
        )

        tagged = tag_successor_aliases_before_delete(self.old_pack)

        self.assertEqual(tagged, 1)
        successor.refresh_from_db()
        self.assertIn("Encrypt Sensitive Data", successor.aliases)

    def test_skips_when_no_live_instances(self):
        """A row with no referencing instances isn't at risk of orphaning
        anything, so it should not be tagged (nothing to preserve)."""
        CountermeasureLibrary.objects.create(
            source_pack=self.old_pack,
            slug="unused-control",
            qualified_slug="recon-test-old-pack/unused-control",
            name="Unused Control",
            description="",
            control_type="preventive",
        )
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="unused-control",
            qualified_slug="recon-test-new-pack/unused-control",
            name="Unused Control",
            description="",
            control_type="preventive",
        )
        # no InstanceCountermeasure created -- nothing at risk

        tagged = tag_successor_aliases_before_delete(self.old_pack)
        self.assertEqual(tagged, 0)
        successor.refresh_from_db()
        self.assertEqual(successor.aliases, [])

    def test_skips_ambiguous_successor(self):
        """Two candidate successors with the same name -- best-effort hook
        must not guess, so it tags nothing."""
        old_row = CountermeasureLibrary.objects.create(
            source_pack=self.old_pack,
            slug="ambiguous-control",
            qualified_slug="recon-test-old-pack/ambiguous-control",
            name="Ambiguous Control",
            description="",
            control_type="preventive",
        )
        third_pack = LibraryPack.objects.create(
            slug="recon-test-third-pack",
            name="Third Pack",
            description="",
            pack_type=LibraryPack.PackType.COUNTERMEASURE,
            version="1.0.0",
            author="test",
        )
        successor_a = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="ambiguous-control",
            qualified_slug="recon-test-new-pack/ambiguous-control",
            name="Ambiguous Control",
            description="",
            control_type="preventive",
        )
        successor_b = CountermeasureLibrary.objects.create(
            source_pack=third_pack,
            slug="ambiguous-control",
            qualified_slug="recon-test-third-pack/ambiguous-control",
            name="Ambiguous Control",
            description="",
            control_type="preventive",
        )
        InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=old_row,
            countermeasure_name=old_row.name,
        )

        tagged = tag_successor_aliases_before_delete(self.old_pack)

        self.assertEqual(tagged, 0)
        successor_a.refresh_from_db()
        successor_b.refresh_from_db()
        self.assertEqual(successor_a.aliases, [])
        self.assertEqual(successor_b.aliases, [])

    def test_survives_a_later_rename_of_the_successor(self):
        """The durability case this hook actually buys: tag now, while old
        and successor share a name; later the successor's own name is
        overwritten (simulating a further in-place edit) -- the alias
        tagged earlier still holds the name an orphan created *before* the
        first deletion would carry, so it's still findable."""
        old_row = CountermeasureLibrary.objects.create(
            source_pack=self.old_pack,
            slug="patch-mgmt",
            qualified_slug="recon-test-old-pack/patch-mgmt",
            name="Patch Management",
            description="",
            control_type="preventive",
        )
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="patch-mgmt",
            qualified_slug="recon-test-new-pack/patch-mgmt",
            name="Patch Management",
            description="",
            control_type="preventive",
        )
        instance = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=old_row,
            countermeasure_name="Patch Management",
        )

        tag_successor_aliases_before_delete(self.old_pack)

        # Actually delete old_row now (what _hard_delete_pack_items /
        # the unimport view do next in real code) -- SET_NULL fires on the
        # pre-existing `instance`, which is the real orphaning mechanism,
        # not a freshly-created row.
        old_row.delete()
        instance.refresh_from_db()
        self.assertIsNone(instance.countermeasure_library_id)

        # Simulate the successor being renamed later (a further reimport
        # that changes the YAML `id` creates a new row rather than editing
        # this one under #318's patch, but a direct rename is possible too).
        successor.refresh_from_db()
        successor.name = "Patch Management (Automated)"
        successor.save(update_fields=["name"])

        call_command("reconcile_orphaned_countermeasures", "--execute", stdout=StringIO())

        instance.refresh_from_db()
        self.assertEqual(instance.countermeasure_library_id, successor.id)


class LoadCountermeasuresAliasesTests(ReconciliationTestBase):
    def _write_yaml(self, countermeasures: list[dict]) -> Path:
        tmpdir = Path(tempfile.mkdtemp())
        cm_file = tmpdir / "countermeasures.yaml"
        with open(cm_file, "w") as f:
            yaml.safe_dump({"countermeasures": countermeasures}, f)
        return cm_file

    def test_yaml_declared_aliases_are_stored(self):
        cm_file = self._write_yaml([
            {
                "id": "mfa-v2",
                "name": "Multi-Factor Authentication (Hardware Token)",
                "description": "desc",
                "aliases": ["Multi-Factor Authentication"],
            }
        ])

        _load_countermeasures(self.new_pack, cm_file)

        row = CountermeasureLibrary.objects.get(qualified_slug="recon-test-new-pack/mfa-v2")
        self.assertEqual(row.aliases, ["Multi-Factor Authentication"])

    def test_yaml_aliases_merge_not_overwrite_on_reimport(self):
        """A reimport with different (or no) aliases must not wipe out an
        alias tag_successor_aliases_before_delete already wrote -- defaults=
        in update_or_create would clobber it if aliases weren't handled
        separately."""
        row = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="mfa-v2",
            qualified_slug="recon-test-new-pack/mfa-v2",
            name="Multi-Factor Authentication (Hardware Token)",
            description="desc",
            control_type="preventive",
            aliases=["Multi-Factor Authentication"],
        )

        cm_file = self._write_yaml([
            {
                "id": "mfa-v2",
                "name": "Multi-Factor Authentication (Hardware Token)",
                "description": "desc",
                # no aliases key this time -- reimport, e.g. a version bump
            }
        ])
        _load_countermeasures(self.new_pack, cm_file)

        row.refresh_from_db()
        self.assertEqual(row.aliases, ["Multi-Factor Authentication"])

        # And a second YAML-declared alias gets appended, not replacing the first
        cm_file2 = self._write_yaml([
            {
                "id": "mfa-v2",
                "name": "Multi-Factor Authentication (Hardware Token)",
                "description": "desc",
                "aliases": ["MFA Enforcement"],
            }
        ])
        _load_countermeasures(self.new_pack, cm_file2)
        row.refresh_from_db()
        self.assertEqual(row.aliases, ["Multi-Factor Authentication", "MFA Enforcement"])


class ReconcileOrphanedCountermeasuresCommandTests(ReconciliationTestBase):
    def test_exact_name_match_relinks(self):
        """The straightforward case: countermeasure moved packs, name
        unchanged -- exact-name match finds it without needing aliases."""
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="mfa",
            qualified_slug="recon-test-new-pack/mfa",
            name="Multi-Factor Authentication",
            description="desc",
            control_type="preventive",
        )
        orphan = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=None,
            countermeasure_name="Multi-Factor Authentication",
            countermeasure_description="desc",
            control_type="preventive",
        )

        out = StringIO()
        call_command("reconcile_orphaned_countermeasures", "--execute", stdout=out)

        orphan.refresh_from_db()
        self.assertEqual(orphan.countermeasure_library_id, successor.id)
        self.assertIn("Relinked 1 row", out.getvalue())

    def test_alias_match_relinks_after_rename(self):
        """The hard case: countermeasure renamed *and* moved packs in the
        same operation, so the instance's copied (old) name never matches
        any current row's `name`. A pack author declared the old name via
        YAML `aliases:` on import (see LoadCountermeasuresAliasesTests for
        that half); this test checks the reconcile command's consuming
        side: it must fall back to an aliases match and find it."""
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="mfa-v2",
            qualified_slug="recon-test-new-pack/mfa-v2",
            name="Multi-Factor Authentication (Hardware Token)",
            description="desc",
            control_type="preventive",
            aliases=["Multi-Factor Authentication"],
        )
        orphan = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=None,
            countermeasure_name="Multi-Factor Authentication",
            countermeasure_description="desc",
            control_type="preventive",
        )

        out = StringIO()
        call_command("reconcile_orphaned_countermeasures", "--execute", stdout=out)

        orphan.refresh_from_db()
        self.assertEqual(orphan.countermeasure_library_id, successor.id)
        self.assertIn("Relinked 1 row", out.getvalue())

    def test_ambiguous_name_match_is_not_relinked(self):
        """Two current rows share a name -- command must report and skip,
        never guess."""
        CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="dup-a",
            qualified_slug="recon-test-new-pack/dup-a",
            name="Duplicate Name Control",
            description="",
            control_type="preventive",
        )
        CountermeasureLibrary.objects.create(
            source_pack=self.old_pack,
            slug="dup-b",
            qualified_slug="recon-test-old-pack/dup-b",
            name="Duplicate Name Control",
            description="",
            control_type="preventive",
        )
        orphan = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=None,
            countermeasure_name="Duplicate Name Control",
        )

        out = StringIO()
        call_command("reconcile_orphaned_countermeasures", "--execute", stdout=out)

        orphan.refresh_from_db()
        self.assertIsNone(orphan.countermeasure_library_id)
        self.assertIn("Ambiguous, skipped: 1", out.getvalue())

    def test_dry_run_makes_no_changes(self):
        CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="dry-run-control",
            qualified_slug="recon-test-new-pack/dry-run-control",
            name="Dry Run Control",
            description="",
            control_type="preventive",
        )
        orphan = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=None,
            countermeasure_name="Dry Run Control",
        )

        out = StringIO()
        call_command("reconcile_orphaned_countermeasures", stdout=out)  # no --execute

        orphan.refresh_from_db()
        self.assertIsNone(orphan.countermeasure_library_id)
        self.assertIn("DRY RUN", out.getvalue())

    def test_threat_model_scoping(self):
        """--threat-model limits the scope to a single threat model."""
        other_tm = ThreatModel.objects.create(organization=self.org, name="Other TM")
        successor = CountermeasureLibrary.objects.create(
            source_pack=self.new_pack,
            slug="scoped-control",
            qualified_slug="recon-test-new-pack/scoped-control",
            name="Scoped Control",
            description="",
            control_type="preventive",
        )
        in_scope = InstanceCountermeasure.objects.create(
            threat_model=self.threat_model,
            countermeasure_library=None,
            countermeasure_name="Scoped Control",
        )
        out_of_scope = InstanceCountermeasure.objects.create(
            threat_model=other_tm,
            countermeasure_library=None,
            countermeasure_name="Scoped Control",
        )

        call_command(
            "reconcile_orphaned_countermeasures",
            "--execute",
            "--threat-model",
            str(self.threat_model.id),
            stdout=StringIO(),
        )

        in_scope.refresh_from_db()
        out_of_scope.refresh_from_db()
        self.assertEqual(in_scope.countermeasure_library_id, successor.id)
        self.assertIsNone(out_of_scope.countermeasure_library_id)
