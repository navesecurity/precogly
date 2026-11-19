"""Which threat models a pack is connected to automatically.

Upstream connected every pack to every threat model (catalog sync, single import, model
creation). A pack can hold one client's content, so that put another client's threats on
a model. The rules here are narrower:

- Creating a threat model connects only the packs named in settings.PACK_AUTO_CONNECT_SLUGS
  (none by default).
- Syncing or importing a pack connects it to no model unless the request lists model ids
  (`threat_model_ids`), and then only to models in an organisation the requester belongs to.
"""

from django.conf import settings

from apps.packs.models import LibraryPack


def connect_default_packs(threat_model):
    """Connect the allowlisted packs to a newly created threat model."""
    from apps.threat_models.models import ThreatModelLibraryPack

    slugs = list(getattr(settings, "PACK_AUTO_CONNECT_SLUGS", []))
    if not slugs:
        return 0
    packs = LibraryPack.objects.filter(slug__in=slugs)
    created = ThreatModelLibraryPack.objects.bulk_create(
        [ThreatModelLibraryPack(threat_model=threat_model, library_pack=p) for p in packs],
        ignore_conflicts=True,
    )
    return len(created)


def requested_threat_models(request):
    """Threat models named by the request's `threat_model_ids`, limited to the requester's organisations."""
    from apps.threat_models.models import ThreatModel

    raw = request.data.get("threat_model_ids")
    if not isinstance(raw, list):
        return ThreatModel.objects.none()
    ids = [i for i in raw if isinstance(i, int) and not isinstance(i, bool)]
    org_ids = request.user.organization_memberships.values_list("organization_id", flat=True)
    return ThreatModel.objects.filter(id__in=ids, organization_id__in=list(org_ids))


def connect_packs_to_requested_models(request, packs):
    """Connect `packs` to the models the request names. Returns the number of models connected."""
    from apps.threat_models.models import ThreatModelLibraryPack

    models = list(requested_threat_models(request))
    packs = list(packs)
    if not models or not packs:
        return 0
    ThreatModelLibraryPack.objects.bulk_create(
        [ThreatModelLibraryPack(threat_model=tm, library_pack=p) for tm in models for p in packs],
        ignore_conflicts=True,
    )
    return len(models)
