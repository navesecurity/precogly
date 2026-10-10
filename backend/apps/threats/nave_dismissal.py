"""Nave-owned dismissal addition, layered on upstream's triage fields.

Upstream replaced `is_dismissed` / `dismissal_reason` with `triage_status` /
`decision_rationale` (threats migration 0014). Nave keeps a dismissal concept
upstream's four treatments do not cover: a threat ruled out with a written,
instance-specific reason ("not applicable", "mis-targeted", "recorded once
elsewhere"). That is not `eliminate` ("remove the threat source"), and SOP 01
7.4 maps it to CISO Assistant `cancelled`, whereas an active Eliminate maps to
`avoid`.

So `is_dismissed` / `dismissal_reason` stay real columns, and this mixin mirrors
a dismissal onto `triage_status = eliminate` so every upstream code path that
treats a triaged-out threat as inactive (reports, counts, drift) keeps working
without per-site patches. `is_dismissed` remains the source of truth for
"dismissed"; `eliminate` alone does not imply it.
"""

from django.db import models

DISMISSED_TRIAGE_STATUS = "eliminate"


class NaveDismissalMixin(models.Model):
    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        d = self.__dict__
        self._nave_orig = (d.get("is_dismissed", False), d.get("triage_status", "open"))

    def save(self, *args, **kwargs):
        orig_dismissed, orig_triage = getattr(self, "_nave_orig", (False, "open"))
        touched = set()
        if self.is_dismissed and not orig_dismissed:
            # Newly dismissed: mirror onto triage so upstream treats it as inactive.
            if self.triage_status != DISMISSED_TRIAGE_STATUS:
                self.triage_status = DISMISSED_TRIAGE_STATUS
                touched.add("triage_status")
            if not self.decision_rationale and self.dismissal_reason:
                self.decision_rationale = self.dismissal_reason
                touched.add("decision_rationale")
        elif (
            self.is_dismissed
            and orig_dismissed
            and self.triage_status != orig_triage
            and self.triage_status != DISMISSED_TRIAGE_STATUS
        ):
            # Triage moved off eliminate in the UI: the threat is live again.
            self.is_dismissed = False
            touched.add("is_dismissed")
        uf = kwargs.get("update_fields")
        if uf is not None and touched:
            kwargs["update_fields"] = list(set(uf) | touched)
        super().save(*args, **kwargs)
        self._nave_orig = (self.is_dismissed, self.triage_status)
