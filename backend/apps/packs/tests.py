"""Tests for path-based pack discovery, O(1) lookup (issue #33),
taxonomy reference validation (issue #26), and pack validation gaps (issue #10)."""

import tempfile
from pathlib import Path
from unittest import mock

import yaml
from django.test import SimpleTestCase, TestCase

from apps.packs.services import (
    ImportResult,
    _find_pack_dir,
    _is_valid_slug,
    discover_packs_from_source,
    import_pack_from_path,
    validate_pack,
)
from apps.threats.models import ThreatLibrary, ThreatLibraryTaxonomyEntry


def _empty_pack_queryset():
    """Stand-in for LibraryPack.objects.all() that yields nothing.

    discover_packs_from_source() reads installed packs from the DB to
    flag is_in_database; tests covering on-disk discovery don't care
    about that signal, so we mock the queryset instead of spinning up a
    real database.
    """
    return iter([])


def _write_pack(base_dir: Path, relative_path: str, slug: str, **overrides) -> Path:
    """Create a minimal pack on disk under base_dir/relative_path."""
    pack_dir = base_dir / relative_path
    pack_dir.mkdir(parents=True, exist_ok=True)

    pack_meta = {
        "slug": slug,
        "name": slug,
        "version": "1.0.0",
        "pack_type": "technology",
        "author": "Test",
    }
    pack_meta.update(overrides)

    pack_yaml = pack_dir / "pack.yaml"
    pack_yaml.write_text(yaml.safe_dump({"pack": pack_meta}))
    return pack_dir


class FindPackDirTests(SimpleTestCase):
    """_find_pack_dir is O(1): it only checks the path it was given."""

    def test_resolves_top_level_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _write_pack(base, "aws", slug="aws")

            result = _find_pack_dir(base, "aws")

            self.assertEqual(result, base / "aws")

    def test_resolves_nested_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _write_pack(base, "frameworks/nist-csf", slug="nist-csf")

            result = _find_pack_dir(base, "frameworks/nist-csf")

            self.assertEqual(result, base / "frameworks" / "nist-csf")

    def test_returns_none_for_missing_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)

            self.assertIsNone(_find_pack_dir(base, "does-not-exist"))

    def test_returns_none_when_pack_yaml_absent(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "empty-dir").mkdir()

            self.assertIsNone(_find_pack_dir(base, "empty-dir"))

    def test_does_not_recursively_scan(self):
        # If two packs share a slug under different paths, _find_pack_dir
        # must return the directory at the requested path, not any
        # other matching slug elsewhere in the tree.
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _write_pack(base, "frameworks/nist-csf", slug="nist-csf")
            _write_pack(base, "demo/nist-csf", slug="nist-csf")

            framework_dir = _find_pack_dir(base, "frameworks/nist-csf")
            demo_dir = _find_pack_dir(base, "demo/nist-csf")

            self.assertEqual(framework_dir, base / "frameworks" / "nist-csf")
            self.assertEqual(demo_dir, base / "demo" / "nist-csf")
            self.assertNotEqual(framework_dir, demo_dir)


class DiscoveryAndDisambiguationTests(SimpleTestCase):
    """discover_packs_from_source computes relative_path from the filesystem."""

    def _patch_db_and_path(self, base):
        return mock.patch.multiple(
            "apps.packs.services",
            get_libraries_path=mock.MagicMock(return_value=base),
            LibraryPack=mock.MagicMock(
                objects=mock.MagicMock(
                    all=mock.MagicMock(return_value=_empty_pack_queryset()),
                )
            ),
        )

    def test_duplicate_slugs_under_different_paths_are_both_discovered(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            with self._patch_db_and_path(base):
                _write_pack(base, "frameworks/nist-csf", slug="nist-csf")
                _write_pack(base, "demo/nist-csf", slug="nist-csf")

                packs = discover_packs_from_source()
                nist_packs = [p for p in packs if p.slug == "nist-csf"]

                self.assertEqual(len(nist_packs), 2)
                paths = {p.relative_path for p in nist_packs}
                self.assertEqual(
                    paths,
                    {"frameworks/nist-csf", "demo/nist-csf"},
                )

    def test_relative_path_computed_from_filesystem(self):
        # relative_path should match the actual directory location,
        # regardless of what's in pack.yaml.
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            with self._patch_db_and_path(base):
                _write_pack(base, "frameworks/owasp", slug="owasp")

                packs = discover_packs_from_source()
                owasp = next(p for p in packs if p.slug == "owasp")

                self.assertEqual(owasp.relative_path, "frameworks/owasp")

    def test_depends_on_with_path_disambiguates(self):
        # A pack depends on nist-csf and disambiguates which one via path.
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            with self._patch_db_and_path(base):
                _write_pack(base, "frameworks/nist-csf", slug="nist-csf")
                _write_pack(base, "demo/nist-csf", slug="nist-csf")
                _write_pack(
                    base,
                    "consumer",
                    slug="consumer",
                    depends_on=[
                        {
                            "pack": "nist-csf",
                            "path": "demo/nist-csf",
                        }
                    ],
                )

                packs = discover_packs_from_source()
                consumer = next(p for p in packs if p.slug == "consumer")

                self.assertEqual(len(consumer.depends_on), 1)
                dep = consumer.depends_on[0]
                self.assertEqual(dep["slug"], "nist-csf")
                self.assertEqual(dep["path"], "demo/nist-csf")

    def test_path_format_string_depends_on_resolves(self):
        # depends_on with path-format strings like "taxonomies/stride-taxonomy"
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            with self._patch_db_and_path(base):
                _write_pack(base, "taxonomies/stride-taxonomy", slug="stride-taxonomy")
                _write_pack(
                    base,
                    "consumer",
                    slug="consumer",
                    depends_on=["taxonomies/stride-taxonomy"],
                )

                packs = discover_packs_from_source()
                consumer = next(p for p in packs if p.slug == "consumer")

                self.assertEqual(len(consumer.depends_on), 1)
                dep = consumer.depends_on[0]
                self.assertEqual(dep["slug"], "stride-taxonomy")
                self.assertEqual(dep["path"], "taxonomies/stride-taxonomy")


class TaxonomyReferenceValidationTests(SimpleTestCase):
    """validate_pack catches bad taxonomy slugs in joins/threats-*.yaml (#26)."""

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    def test_validate_rejects_unknown_taxonomy_reference(self, mock_taxonomy_model):
        mock_taxonomy_model.objects.values_list.return_value = []

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "bad-pack", slug="bad-pack")

            joins_dir = pack_dir / "joins"
            joins_dir.mkdir()
            join_data = {"taxonomy": "nonexistent-taxonomy", "mappings": []}
            (joins_dir / "threats-foo.yaml").write_text(yaml.safe_dump(join_data))

            result = validate_pack(pack_dir)

            taxonomy_errors = [e for e in result.errors if e.ref_type == "taxonomy"]
            self.assertEqual(len(taxonomy_errors), 1)
            self.assertEqual(taxonomy_errors[0].reference, "nonexistent-taxonomy")
            self.assertIn("taxonomy.yaml", taxonomy_errors[0].message)
            self.assertIn("not from the pack slug", taxonomy_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    def test_validate_accepts_valid_taxonomy_reference(self, mock_taxonomy_model):
        mock_taxonomy_model.objects.values_list.return_value = []

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "good-pack", slug="good-pack")

            # Pack defines its own taxonomy
            tax_data = {
                "taxonomies": [{"slug": "cwe", "name": "CWE", "entries": []}]
            }
            (pack_dir / "taxonomy.yaml").write_text(yaml.safe_dump(tax_data))

            joins_dir = pack_dir / "joins"
            joins_dir.mkdir()
            join_data = {"taxonomy": "cwe", "mappings": []}
            (joins_dir / "threats-cwe.yaml").write_text(yaml.safe_dump(join_data))

            result = validate_pack(pack_dir)

            taxonomy_errors = [e for e in result.errors if e.ref_type == "taxonomy"]
            self.assertEqual(len(taxonomy_errors), 0)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.packs.services.get_libraries_path")
    def test_validate_accepts_taxonomy_from_dependency(
        self, mock_get_libraries_path, mock_lp, mock_taxonomy_model
    ):
        mock_taxonomy_model.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mock_get_libraries_path.return_value = base

            # Dependency pack provides the taxonomy
            dep_dir = _write_pack(
                base, "cwe-taxonomy", slug="cwe-taxonomy", pack_type="taxonomy"
            )
            tax_data = {
                "taxonomies": [{"slug": "cwe", "name": "CWE", "entries": []}]
            }
            (dep_dir / "taxonomy.yaml").write_text(yaml.safe_dump(tax_data))

            # Downstream pack references the dependency's taxonomy
            pack_dir = _write_pack(
                base,
                "cwe",
                slug="cwe",
                pack_type="threat",
                depends_on=["cwe-taxonomy"],
            )
            joins_dir = pack_dir / "joins"
            joins_dir.mkdir()
            join_data = {"taxonomy": "cwe", "mappings": []}
            (joins_dir / "threats-cwe.yaml").write_text(yaml.safe_dump(join_data))

            result = validate_pack(pack_dir)

            taxonomy_errors = [e for e in result.errors if e.ref_type == "taxonomy"]
            self.assertEqual(len(taxonomy_errors), 0)


# =========================================================================
# Phase 2: Duplicate ID detection (issue #10)
# =========================================================================


class DuplicateIdValidationTests(SimpleTestCase):
    """validate_pack catches duplicate IDs that would cause silent overwrites."""

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_duplicate_component_ids_are_errors(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "dup-pack", slug="dup-pack")

            comp_data = {
                "components": [
                    {"id": "web-server", "name": "Web Server", "category": "process"},
                    {"id": "web-server", "name": "Web Server Copy", "category": "process"},
                ]
            }
            (pack_dir / "components.yaml").write_text(yaml.safe_dump(comp_data))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate component id" in e.message
            ]
            self.assertEqual(len(dup_errors), 1)
            self.assertIn("web-server", dup_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_duplicate_threat_ids_are_errors(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "dup-pack", slug="dup-pack")

            threat_data = {
                "threats": [
                    {"id": "sql-injection", "name": "SQL Injection"},
                    {"id": "sql-injection", "name": "SQL Injection 2"},
                ]
            }
            (pack_dir / "threats.yaml").write_text(yaml.safe_dump(threat_data))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate threat id" in e.message
            ]
            self.assertEqual(len(dup_errors), 1)
            self.assertIn("sql-injection", dup_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_duplicate_countermeasure_ids_are_errors(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "dup-pack", slug="dup-pack")

            cm_data = {
                "countermeasures": [
                    {"slug": "mfa", "name": "MFA", "control_type": "preventive", "cost": "low"},
                    {"slug": "mfa", "name": "MFA duplicate", "control_type": "preventive", "cost": "low"},
                ]
            }
            (pack_dir / "countermeasures.yaml").write_text(yaml.safe_dump(cm_data))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate countermeasure id" in e.message
            ]
            self.assertEqual(len(dup_errors), 1)
            self.assertIn("mfa", dup_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_duplicate_framework_section_codes_are_errors(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            pack_dir = base / "fw-pack"
            pack_dir.mkdir()

            pack_yaml = {
                "pack": {
                    "slug": "fw-pack",
                    "name": "fw-pack",
                    "version": "1.0.0",
                    "pack_type": "compliance",
                },
                "frameworks": [{
                    "slug": "test-fw",
                    "name": "Test Framework",
                    "requirements": [
                        {"section_code": "1.1", "description": "First"},
                        {"section_code": "1.1", "description": "Duplicate"},
                    ],
                }],
            }
            (pack_dir / "pack.yaml").write_text(yaml.safe_dump(pack_yaml))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate section_code" in e.message
            ]
            self.assertEqual(len(dup_errors), 1)
            self.assertIn("1.1", dup_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_duplicate_taxonomy_external_ids_are_errors(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "tax-pack", slug="tax-pack")

            tax_data = {
                "taxonomies": [{
                    "slug": "cwe",
                    "name": "CWE",
                    "entries": [
                        {"external_id": "CWE-79", "title": "XSS"},
                        {"external_id": "CWE-79", "title": "XSS duplicate"},
                    ],
                }]
            }
            (pack_dir / "taxonomy.yaml").write_text(yaml.safe_dump(tax_data))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate external_id" in e.message
            ]
            self.assertEqual(len(dup_errors), 1)
            self.assertIn("CWE-79", dup_errors[0].message)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_unique_ids_pass_validation(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "clean-pack", slug="clean-pack")

            comp_data = {
                "components": [
                    {"id": "web-server", "name": "Web Server", "category": "process"},
                    {"id": "database", "name": "Database", "category": "datastore"},
                ]
            }
            (pack_dir / "components.yaml").write_text(yaml.safe_dump(comp_data))

            result = validate_pack(pack_dir)

            dup_errors = [
                e for e in result.errors
                if "Duplicate" in e.message
            ]
            self.assertEqual(len(dup_errors), 0)


# =========================================================================
# Phase 3: Overlay section_code validation (issue #10)
# =========================================================================


class OverlaySectionCodeValidationTests(SimpleTestCase):
    """validate_pack checks overlay section_codes against framework requirements."""

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.compliance.models.StandardRequirement")
    @mock.patch("apps.compliance.models.StandardFramework")
    def test_invalid_section_code_is_error(
        self, mock_fw, mock_req, mock_lp, mock_taxonomy
    ):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        # Framework exists
        mock_framework_instance = mock.MagicMock()
        mock_fw.objects.filter.return_value.first.return_value = mock_framework_instance

        # Framework has requirements — but not the one we reference
        mock_req.objects.filter.return_value.values_list.return_value = ["1.1", "1.2"]

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "overlay-pack", slug="overlay-pack")

            joins_dir = pack_dir / "joins"
            joins_dir.mkdir()
            overlay_data = {
                "framework": "nist-csf",
                "mappings": [
                    {"countermeasure": "mfa", "requirements": ["1.1", "BOGUS"]},
                ],
            }
            (joins_dir / "countermeasures-nist-csf.yaml").write_text(
                yaml.safe_dump(overlay_data)
            )

            result = validate_pack(pack_dir)

            section_errors = [
                e for e in result.errors
                if "section_code" in e.message and "BOGUS" in e.message
            ]
            self.assertEqual(len(section_errors), 1)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.compliance.models.StandardFramework")
    def test_missing_framework_is_warning(self, mock_fw, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        # Framework does NOT exist
        mock_fw.objects.filter.return_value.first.return_value = None

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "overlay-pack", slug="overlay-pack")

            joins_dir = pack_dir / "joins"
            joins_dir.mkdir()
            overlay_data = {
                "framework": "nonexistent-fw",
                "mappings": [
                    {"countermeasure": "mfa", "requirements": ["1.1"]},
                ],
            }
            (joins_dir / "countermeasures-nonexistent-fw.yaml").write_text(
                yaml.safe_dump(overlay_data)
            )

            result = validate_pack(pack_dir)

            fw_warnings = [
                w for w in result.warnings
                if "nonexistent-fw" in w.message and "not found" in w.message
            ]
            self.assertEqual(len(fw_warnings), 1)
            # Should NOT be an error
            fw_errors = [
                e for e in result.errors
                if "nonexistent-fw" in e.message
            ]
            self.assertEqual(len(fw_errors), 0)


# =========================================================================
# Phase 4: depends_on validation (issue #10)
# =========================================================================


class DependsOnValidationTests(SimpleTestCase):
    """validate_pack warns when depends_on references can't be found."""

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.packs.services.get_libraries_path")
    def test_missing_dependency_is_warning(
        self, mock_get_libraries_path, mock_lp, mock_taxonomy
    ):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mock_get_libraries_path.return_value = base

            pack_dir = _write_pack(
                base, "dep-pack", slug="dep-pack",
                depends_on=["nonexistent-dep"],
            )

            result = validate_pack(pack_dir)

            dep_warnings = [
                w for w in result.warnings
                if "nonexistent-dep" in w.message and "depends_on" in w.field
            ]
            self.assertEqual(len(dep_warnings), 1)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.packs.services.get_libraries_path")
    def test_found_dependency_no_warning(
        self, mock_get_libraries_path, mock_lp, mock_taxonomy
    ):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mock_get_libraries_path.return_value = base

            # Create the dependency pack on disk
            _write_pack(base, "stride-taxonomy", slug="stride-taxonomy")

            pack_dir = _write_pack(
                base, "dep-pack", slug="dep-pack",
                depends_on=["stride-taxonomy"],
            )

            result = validate_pack(pack_dir)

            dep_warnings = [
                w for w in result.warnings
                if "stride-taxonomy" in w.message and "depends_on" in w.field
            ]
            self.assertEqual(len(dep_warnings), 0)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.packs.services.get_libraries_path")
    def test_missing_dependency_is_not_error(
        self, mock_get_libraries_path, mock_lp, mock_taxonomy
    ):
        """Missing dependencies are warnings, not errors — import should still succeed."""
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mock_get_libraries_path.return_value = base

            pack_dir = _write_pack(
                base, "dep-pack", slug="dep-pack",
                depends_on=["ghost-pack"],
            )

            result = validate_pack(pack_dir)

            dep_errors = [
                e for e in result.errors
                if "ghost-pack" in e.message
            ]
            self.assertEqual(len(dep_errors), 0)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    @mock.patch("apps.packs.services.get_libraries_path")
    def test_path_format_depends_on_resolves(
        self, mock_get_libraries_path, mock_lp, mock_taxonomy
    ):
        """depends_on with path-format strings (e.g. 'taxonomies/stride-taxonomy') should resolve."""
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            mock_get_libraries_path.return_value = base

            # Create the dependency at the path
            _write_pack(base, "taxonomies/stride-taxonomy", slug="stride-taxonomy")

            pack_dir = _write_pack(
                base, "dep-pack", slug="dep-pack",
                depends_on=["taxonomies/stride-taxonomy"],
            )

            result = validate_pack(pack_dir)

            dep_warnings = [
                w for w in result.warnings
                if "stride-taxonomy" in w.message and "depends_on" in w.field
            ]
            self.assertEqual(len(dep_warnings), 0)


# =========================================================================
# Phase 5: Slug format validation (issue #10)
# =========================================================================


class SlugFormatValidationTests(SimpleTestCase):
    """validate_pack warns on non-conforming slug formats."""

    def test_is_valid_slug_accepts_good_slugs(self):
        self.assertTrue(_is_valid_slug("aws"))
        self.assertTrue(_is_valid_slug("aws-core"))
        self.assertTrue(_is_valid_slug("base-stride"))
        self.assertTrue(_is_valid_slug("a1-b2-c3"))

    def test_is_valid_slug_rejects_bad_slugs(self):
        self.assertFalse(_is_valid_slug("AWS"))
        self.assertFalse(_is_valid_slug("my_pack"))
        self.assertFalse(_is_valid_slug("my.pack"))
        self.assertFalse(_is_valid_slug("-leading-hyphen"))
        self.assertFalse(_is_valid_slug("trailing-hyphen-"))
        self.assertFalse(_is_valid_slug("double--hyphen"))
        self.assertFalse(_is_valid_slug(""))

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_bad_pack_slug_is_warning(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "Bad_Pack", slug="Bad_Pack")

            result = validate_pack(pack_dir)

            slug_warnings = [
                w for w in result.warnings
                if "Bad_Pack" in w.message and "slug" in w.field
            ]
            self.assertEqual(len(slug_warnings), 1)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_bad_component_id_is_warning(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "slug-pack", slug="slug-pack")

            comp_data = {
                "components": [
                    {"id": "aws_lambda", "name": "Lambda", "category": "process"},
                ]
            }
            (pack_dir / "components.yaml").write_text(yaml.safe_dump(comp_data))

            result = validate_pack(pack_dir)

            slug_warnings = [
                w for w in result.warnings
                if "aws_lambda" in w.message and "slug format" in w.message
            ]
            self.assertEqual(len(slug_warnings), 1)

    @mock.patch("apps.packs.services.ExternalTaxonomy")
    @mock.patch("apps.packs.services.LibraryPack")
    def test_good_slug_no_warning(self, mock_lp, mock_taxonomy):
        mock_taxonomy.objects.values_list.return_value = []
        mock_lp.objects.filter.return_value.exists.return_value = False

        with tempfile.TemporaryDirectory() as tmp:
            pack_dir = _write_pack(Path(tmp), "good-pack", slug="good-pack")

            comp_data = {
                "components": [
                    {"id": "web-server", "name": "Web Server", "category": "process"},
                ]
            }
            (pack_dir / "components.yaml").write_text(yaml.safe_dump(comp_data))

            result = validate_pack(pack_dir)

            slug_warnings = [
                w for w in result.warnings
                if "slug format" in w.message
            ]
            self.assertEqual(len(slug_warnings), 0)


# =========================================================================
# Phase 1: ImportResult warnings (issue #10)
# =========================================================================


class ImportResultWarningsTests(SimpleTestCase):
    """ImportResult exposes warnings field in dataclass and to_dict()."""

    def test_import_result_has_warnings_field(self):
        result = ImportResult(
            success=True,
            pack_slug="test",
            pack_name="Test",
            version="1.0.0",
            message="OK",
            warnings=["something was skipped"],
        )
        self.assertEqual(result.warnings, ["something was skipped"])

    def test_import_result_to_dict_includes_warnings(self):
        result = ImportResult(
            success=True,
            pack_slug="test",
            pack_name="Test",
            version="1.0.0",
            message="OK",
            warnings=["warn1", "warn2"],
        )
        d = result.to_dict()
        self.assertIn("warnings", d)
        self.assertEqual(d["warnings"], ["warn1", "warn2"])

    def test_import_result_warnings_default_empty(self):
        result = ImportResult(
            success=True,
            pack_slug="test",
            pack_name="Test",
            version="1.0.0",
            message="OK",
        )
        self.assertEqual(result.warnings, [])
        self.assertEqual(result.to_dict()["warnings"], [])


# =========================================================================
# import_single's taxonomy-join transaction-ordering bug (found 2026-08-20)
# =========================================================================


class ImportSinglePackTaxonomyJoinReconciliationTests(TestCase):
    """`POST /api/packs/import_single/` (which calls `import_pack_from_path`
    directly, exactly as exercised here) used to report `success: true` with
    a threat-taxonomy join silently missing, with no automatic way to
    self-heal short of a full `sync_from_source(force=True)` bulk resync.

    Root cause: `_load_threat_taxonomy_joins()` resolves a join with a live
    DB lookup at the moment its own pack is imported. If the specific
    taxonomy entry it references doesn't exist yet, it's recorded as a
    `PendingTaxonomyOverlay` and the join is dropped with a warning (not an
    error), so the pack's own import still reports success. The self-heal
    path for this, `_load_taxonomy()` calling `activate_pending_taxonomy_
    overlays()`, only fires when the taxonomy is *newly created*
    (`is_new_taxonomy`) -- reimporting an *already-imported* taxonomy pack
    to add new codes (the normal way codes get added) does not re-trigger
    it, because `ExternalTaxonomy.objects.update_or_create()` finds the
    existing row. `sync_all_packs_from_source()` already had a "third pass"
    workaround for this (re-running `_load_threat_taxonomy_joins()` for
    every pack after the whole batch commits); `import_pack_from_path()`
    (and therefore `import_single`) never did, until this fix.

    This test reproduces the exact failure sequence confirmed live on the
    Precogly server: a content pack's join references a taxonomy code that
    doesn't exist yet at import time (silently dropped, matching the
    documented, correct pending-overlay behavior for a genuinely-missing
    taxonomy pack) and the taxonomy pack is *later* reimported
    (`force=True`) to add the missing code. Before the fix in this commit,
    the join would stay missing forever; after it, `import_pack_from_path`'s
    post-commit reconciliation pass picks it up.
    """

    def test_reimporting_taxonomy_pack_retroactively_resolves_earlier_pending_join(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)

            taxonomy_dir = _write_pack(
                base, "recon-cwe-taxonomy", slug="recon-cwe-taxonomy",
                pack_type="taxonomy", schema_version=1,
            )
            (taxonomy_dir / "taxonomy.yaml").write_text(yaml.safe_dump({
                "taxonomies": [{
                    "slug": "recon-cwe",
                    "name": "Recon CWE",
                    "entries": [
                        {"external_id": "CWE-100", "title": "Placeholder Weakness"},
                    ],
                }],
            }))

            threat_dir = _write_pack(
                base, "recon-threat-pack", slug="recon-threat-pack",
                pack_type="threat", schema_version=1,
            )
            (threat_dir / "threats.yaml").write_text(yaml.safe_dump({
                "threats": [
                    {"id": "t1", "name": "Test Threat One", "description": "..."},
                ],
            }))
            joins_dir = threat_dir / "joins"
            joins_dir.mkdir()
            (joins_dir / "threats-recon-cwe.yaml").write_text(yaml.safe_dump({
                "taxonomy": "recon-cwe",
                "mappings": [
                    {"threat": "t1", "entries": ["CWE-200"]},
                ],
            }))

            with mock.patch("apps.packs.services.get_libraries_path", return_value=base):
                # Step 1: import the taxonomy pack, CWE-200 doesn't exist yet.
                tax_result = import_pack_from_path(taxonomy_dir)
                self.assertTrue(tax_result.success, getattr(tax_result, "errors", tax_result))

                # Step 2: import the threat pack. Its join references
                # CWE-200, which isn't in the taxonomy yet -- dropped with a
                # warning, exactly like a real "import the dependency first"
                # gap. This step alone is expected NOT to create the join;
                # the bug is about what happens (or doesn't) after step 3.
                threat_result = import_pack_from_path(threat_dir)
                self.assertTrue(threat_result.success, getattr(threat_result, "errors", threat_result))

                self.assertEqual(
                    ThreatLibraryTaxonomyEntry.objects.filter(
                        threat_library__qualified_slug="recon-threat-pack/t1"
                    ).count(),
                    0,
                )

                # Step 3: reimport the taxonomy pack (force=True, the normal
                # way new codes get added to an already-imported taxonomy
                # pack) with CWE-200 now included.
                (taxonomy_dir / "taxonomy.yaml").write_text(yaml.safe_dump({
                    "taxonomies": [{
                        "slug": "recon-cwe",
                        "name": "Recon CWE",
                        "entries": [
                            {"external_id": "CWE-100", "title": "Placeholder Weakness"},
                            {"external_id": "CWE-200", "title": "Another Weakness"},
                        ],
                    }],
                }))
                reimport_result = import_pack_from_path(taxonomy_dir, force=True)
                self.assertTrue(reimport_result.success, getattr(reimport_result, "errors", reimport_result))

            # This is the assertion that would have failed before the fix:
            # the join stayed a dangling PendingTaxonomyOverlay forever,
            # with nothing in the single-pack import path to re-check it.
            t1 = ThreatLibrary.objects.get(qualified_slug="recon-threat-pack/t1")
            entries = ThreatLibraryTaxonomyEntry.objects.filter(threat_library=t1)
            self.assertEqual(entries.count(), 1)
            self.assertEqual(entries.first().taxonomy_entry.external_id, "CWE-200")
