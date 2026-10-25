"""JobInput in, §17 LocalSuggestion out. G4 harness only: the behavior lands in G4 IMPLEMENT.

Input is a contract v1 `JobInput` with kind LOCAL_SUGGESTION (packages/domain, PR #2; questions board
1025-021345-inference-state): `reports` ordered by receiveSequence with exact original text, including delivered
but unconfirmed ones; `targetReportId` is one of them; `candidateIncidents` are full IncidentView rows.
"""


class InvalidJob(ValueError):
    code = "INVALID_INPUT"


def suggest(job: dict, runtime) -> dict:
    raise NotImplementedError("G4 IMPLEMENT")
