"""
Management command to relink orphaned InstanceCountermeasure rows back onto
a current CountermeasureLibrary row.

Background (precogly/precogly#318 and Nave's local fix for it): before the
#318 patch, force-reimporting a pack hard-deleted and recreated its library
rows on every reimport, which SET_NULL'd `InstanceCountermeasure.
countermeasure_library` for any instance still pointing at the old row --
silently, with no error, no matter how the countermeasure's identity
changed (renamed within the pack, or moved to a different pack entirely,
e.g. Nave's medtech-atlas AI/LLM component split and the medtech-base ->
medtech-imaging DICOM countermeasure migration). #318's patch stops that
for same-pack reimports going forward, but two things still orphan
instances today:

  1. Pack unimport (`LibraryPackViewSet.unimport`) still hard-deletes a
     pack's CountermeasureLibrary rows outright.
  2. Any instance orphaned *before* #318 landed (2026-08-16) is still
     sitting there -- #318 stopped new orphaning, it didn't repair old
     orphaning.

Two things feed `aliases` (ArrayField, model docstring says "Previous
slugs for backward compatibility" -- populated here with previous *names*
instead, since that's the one identity `InstanceCountermeasure.
countermeasure_name` actually preserves; see `tag_successor_aliases_
before_delete`'s docstring for why):

  1. `apps.packs.services.tag_successor_aliases_before_delete` runs right
     before both deletion paths above and, when it can unambiguously
     identify a same-name successor row in a different pack, records the
     outgoing row's *name* onto the successor's `aliases`. Only useful for
     durability (surviving a later rename of the successor) -- at the
     moment of tagging, exact-name match alone would already find it.
  2. A pack author can declare an `aliases:` list directly on a
     countermeasure's YAML entry (`_load_countermeasures`), for the case
     `tag_successor_aliases_before_delete` cannot detect on its own: a
     rename and a cross-pack move landing in the *same* import, with no
     name ever shared between old and new rows in the database.

Either way, this command is what actually *uses* aliases -- it only
records the information; something still has to relink the orphaned
instances. That's this command.

Matching, in order:
  1. Exact name match: CountermeasureLibrary.name == InstanceCountermeasure.
     countermeasure_name (the name copied onto the instance at creation
     time, so it reflects the *old* row's name, not any current one).
     Unambiguous only -- more than one CountermeasureLibrary row sharing
     that name is reported and skipped, not guessed at.
  2. Alias match (only for instances step 1 left unmatched): CountermeasureLibrary.
     aliases contains the instance's countermeasure_name. Same
     ambiguity rule.

Anything left over is reported and left alone -- this command never
guesses when more than one candidate exists, and it never invents a
successor that isn't already in the database.

Usage:
    # Dry run (preview what would be relinked) -- all threat models
    python manage.py reconcile_orphaned_countermeasures

    # Limit to one threat model
    python manage.py reconcile_orphaned_countermeasures --threat-model 3

    # Actually relink
    python manage.py reconcile_orphaned_countermeasures --execute
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.threats.models import CountermeasureLibrary, InstanceCountermeasure


class Command(BaseCommand):
    help = (
        "Relink orphaned InstanceCountermeasure rows (countermeasure_library_id "
        "IS NULL) onto a current CountermeasureLibrary row, by exact name match "
        "and then by aliases match."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Actually relink orphaned rows (default is dry-run)",
        )
        parser.add_argument(
            "--threat-model",
            type=int,
            default=None,
            help="Limit to a single threat_model_id (default: all threat models)",
        )

    def handle(self, *args, **options):
        execute = options["execute"]
        tm_id = options["threat_model"]

        if not execute:
            self.stdout.write(
                self.style.WARNING("\n[DRY RUN] No records will be changed. Use --execute to relink.\n")
            )

        qs = InstanceCountermeasure.objects.filter(countermeasure_library_id__isnull=True)
        if tm_id:
            qs = qs.filter(threat_model_id=tm_id)
        orphans = list(qs.order_by("threat_model_id", "id"))

        scope = f"threat_model_id={tm_id}" if tm_id else "all threat models"
        self.stdout.write(f"Found {len(orphans)} orphaned InstanceCountermeasure row(s) across {scope}")

        if not orphans:
            self.stdout.write(self.style.SUCCESS("Nothing to do."))
            return

        name_matches: list[tuple[InstanceCountermeasure, CountermeasureLibrary]] = []
        alias_matches: list[tuple[InstanceCountermeasure, CountermeasureLibrary]] = []
        ambiguous: list[tuple[InstanceCountermeasure, list[CountermeasureLibrary], str]] = []
        unmatched: list[tuple[InstanceCountermeasure, str]] = []

        for instance in orphans:
            if not instance.countermeasure_name:
                unmatched.append((instance, "no countermeasure_name copied on this row to match on"))
                continue

            name_candidates = list(
                CountermeasureLibrary.objects.filter(name=instance.countermeasure_name)
            )
            if len(name_candidates) == 1:
                name_matches.append((instance, name_candidates[0]))
                continue
            if len(name_candidates) > 1:
                ambiguous.append((instance, name_candidates, "name"))
                continue

            # No exact-name match at all -- try aliases (covers the case
            # where the countermeasure's name itself changed after the
            # instance's name was copied, but tag_successor_aliases_
            # before_delete recorded the old identity onto a successor).
            alias_candidates = list(
                CountermeasureLibrary.objects.filter(aliases__contains=[instance.countermeasure_name])
            )
            if len(alias_candidates) == 1:
                alias_matches.append((instance, alias_candidates[0]))
            elif len(alias_candidates) > 1:
                ambiguous.append((instance, alias_candidates, "alias"))
            else:
                unmatched.append((instance, "no exact name match and no alias match"))

        self.stdout.write(
            self.style.SUCCESS(f"\nExact name match: {len(name_matches)} row(s)")
        )
        for instance, lib in name_matches:
            diverged = (
                instance.countermeasure_name != lib.name
                or instance.countermeasure_description != lib.description
                or instance.control_type != lib.control_type
            )
            note = "  [content diverged from current library row]" if diverged else ""
            self.stdout.write(
                f"  id={instance.id} threat_model={instance.threat_model_id} "
                f"{instance.countermeasure_name!r} -> library_id={lib.id} "
                f"({lib.qualified_slug}){note}"
            )

        self.stdout.write(
            self.style.SUCCESS(f"\nAlias match: {len(alias_matches)} row(s)")
        )
        for instance, lib in alias_matches:
            self.stdout.write(
                f"  id={instance.id} threat_model={instance.threat_model_id} "
                f"{instance.countermeasure_name!r} -> library_id={lib.id} "
                f"({lib.qualified_slug}, matched via aliases)"
            )

        if ambiguous:
            self.stdout.write(
                self.style.WARNING(f"\nAmbiguous, skipped: {len(ambiguous)} row(s)")
            )
            for instance, candidates, via in ambiguous:
                ids = [c.id for c in candidates]
                self.stdout.write(
                    f"  id={instance.id} threat_model={instance.threat_model_id} "
                    f"{instance.countermeasure_name!r} matched {len(candidates)} rows via {via}: {ids}"
                )

        if unmatched:
            self.stdout.write(
                self.style.WARNING(f"\nNo match, skipped: {len(unmatched)} row(s)")
            )
            for instance, reason in unmatched:
                self.stdout.write(
                    f"  id={instance.id} threat_model={instance.threat_model_id} "
                    f"{instance.countermeasure_name!r}: {reason}"
                )

        to_link = name_matches + alias_matches
        if not to_link:
            self.stdout.write(self.style.NOTICE("\nNothing unambiguous to relink."))
            return

        if execute:
            self.stdout.write(self.style.NOTICE(f"\nRelinking {len(to_link)} row(s)..."))
            with transaction.atomic():
                for instance, lib in to_link:
                    InstanceCountermeasure.objects.filter(pk=instance.pk).update(
                        countermeasure_library_id=lib.id
                    )
            self.stdout.write(self.style.SUCCESS(f"Relinked {len(to_link)} row(s)."))
        else:
            self.stdout.write(
                self.style.NOTICE(f"\n[DRY RUN] Would relink {len(to_link)} row(s). Use --execute to apply.")
            )
