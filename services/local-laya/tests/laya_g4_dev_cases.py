"""Development cases for G4, authored by the laya lane. Not the §18 script and not the PM's held-out set.

`JOBS` is model input. `EXPECT` holds human expectations and is used only to score outputs after the fact; it is
never passed to the worker. `keeps_concern` marks cases where uncertain possible harm must stay visible:
the suggestion's attention must be POSSIBLE_LIFE_SAFETY or null (review), never a lower label.
"""
from laya_g4_helpers import incident, make_job, report

CLINIC = report("d-clinic-1", "Patients may still be on the second floor of the riverside clinic.", 1)
APARTMENTS = report("d-apt-1", "Two residents may be stuck on the third floor of the Oak Street apartments.", 2)
FIREHALL = report("d-fire-1", "Fire hall shelter needs drinking water for tonight.", 3)
BRIDGE = report("d-bridge-1", "East bridge is closed to traffic.", 4)
PUMP = report("d-pump-1", "Pump station 3 is flooded and offline.", 5)
LIBRARY = report("d-lib-1", "Library road is passable for trucks.", 6)

INC = {
    "clinic": incident("d-inc-clinic", "POSSIBLE_LIFE_SAFETY", ["d-clinic-1"], revision=2, start=1),
    "apartments": incident("d-inc-apartments", "POSSIBLE_LIFE_SAFETY", ["d-apt-1"], revision=1, start=2),
    "firehall": incident("d-inc-firehall", "ACTIVE_NEED", ["d-fire-1"], revision=1, start=3),
    "bridge": incident("d-inc-bridge", "INFORMATION", ["d-bridge-1"], revision=1, start=4),
    "pump": incident("d-inc-pump", "INFORMATION", ["d-pump-1"], revision=1, start=5),
    "library": incident("d-inc-library", "INFORMATION", ["d-lib-1"], revision=1, start=6),
}


def _job(text, names=(), relevant=None, **kw):
    reports = {"clinic": CLINIC, "apartments": APARTMENTS, "firehall": FIREHALL, "bridge": BRIDGE,
               "pump": PUMP, "library": LIBRARY}
    return make_job(text, candidates=[INC[n] for n in names],
                    relevant=relevant if relevant is not None else [reports[n] for n in names], **kw)


JOBS = {
    "partial-all-clear": _job(
        "Riverside clinic ground floor is empty. We have not checked the second floor.", ["clinic", "firehall"]),
    "negation": _job("No one is trapped on the east bridge; it is just closed to traffic.", ["bridge", "clinic"]),
    "hearsay": _job("A neighbor says she heard knocking inside the collapsed garage on Elm Road.", ["firehall"]),
    "rescue-question": _job("Did anyone get the people out of the Oak Street apartments yet?",
                            ["apartments", "firehall"]),
    "nearby-separate": _job("Oak Street corner store, next to the apartments: front window broken, nobody inside.",
                            ["apartments"]),
    "low-confidence-harm": _job("Might have seen a light moving in the flooded farmhouse, hard to tell.",
                                ["bridge"]),
    "repeat-need": _job("Fire hall shelter still has no drinking water for the forty people there.",
                        ["firehall", "clinic"]),
    "correction": _job("Correction: it is pump station 4 that is flooded; pump station 3 is fine.", ["pump"]),
    "conflict": _job("Library road is under a meter of water and not passable.", ["library", "bridge"]),
    "pending-correction-kept": _job(
        "Riverside clinic generator is out.", ["clinic"],
        relevant=[CLINIC, report("d-clinic-2", "Correction: clinic patients were moved to the fire hall.", 8)]),
    "separate-new-need": _job("The north school shelter needs baby formula.", ["firehall"]),
    "late-older-all-clear": _job(
        "Report from early this morning: riverside clinic fully evacuated.", ["clinic"],
        relevant=[CLINIC, report("d-clinic-3", "Someone is waving from a second-floor clinic window.", 9,
                                 sent_at="2026-10-25T09:40:00Z")],
        seq=12, sent_at="2026-10-25T07:00:00Z"),
}

EXPECT = {
    "partial-all-clear": {"action": "ATTACH_REPORT", "candidate": "d-inc-clinic", "keeps_concern": True},
    "negation": {"action": "ATTACH_REPORT", "candidate": "d-inc-bridge", "attention": "INFORMATION"},
    "hearsay": {"action": "NEW_INCIDENT", "candidate": None, "keeps_concern": True},
    "rescue-question": {"action": "ATTACH_REPORT", "candidate": "d-inc-apartments", "keeps_concern": True},
    "nearby-separate": {"action": "NEW_INCIDENT", "candidate": None, "attention": "INFORMATION"},
    "low-confidence-harm": {"action": "NEW_INCIDENT", "candidate": None, "keeps_concern": True},
    "repeat-need": {"action": "ATTACH_REPORT", "candidate": "d-inc-firehall", "attention": "ACTIVE_NEED"},
    "correction": {"action": "FLAG_CORRECTION", "candidate": "d-inc-pump", "attention": "INFORMATION"},
    "conflict": {"action": "FLAG_CONFLICT", "candidate": "d-inc-library"},
    "pending-correction-kept": {"action": "ATTACH_REPORT", "candidate": "d-inc-clinic"},
    "separate-new-need": {"action": "NEW_INCIDENT", "candidate": None, "attention": "ACTIVE_NEED"},
    "late-older-all-clear": {"candidate": "d-inc-clinic", "keeps_concern": True},
}
