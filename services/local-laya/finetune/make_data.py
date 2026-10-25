"""Author-only synthetic scenarios. No fixture or evaluation data is read."""
import json
from pathlib import Path

# (earlier evidence, target report, action, attention); fifth wording per category is validation only.
N, A, C, F, R = 'NEW_INCIDENT', 'ATTACH_REPORT', 'FLAG_CORRECTION', 'FLAG_CONFLICT', 'REQUEST_REVIEW'
H, D, I = 'POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION'
SCENARIOS = {
 'new': [
 ('', 'A worker is pinned under a fallen beam at {p}.', N, H),
 ('', 'The crew at {p} needs drinking water; everyone is safe.', N, D),
 ('', 'The footpath at {p} is open and no assistance is needed.', N, I),
 ('', 'Smoke is coming from {p}; someone may be inside.', N, H),
 ('', 'Two visitors at {p} are cut off by fast water.', N, H)],
 'repeat': [
 ('A person is trapped at {p}.', 'Again reporting the same trapped person at {p}; no change.', A, H),
 ('The team needs batteries at {p}.', 'Still waiting for batteries at {p}, nobody is in danger.', A, D),
 ('Debris blocks the exit at {p}, workers inside.', 'The exit at {p} remains blocked with workers behind it.', A, H),
 ('The path at {p} has reopened.', 'Confirming that the route through {p} is open, no help needed.', A, I),
 ('People at {p} cannot leave because of rising water.', 'Same group at {p} remains stranded by the water.', A, H)],
 'correction': [
 ('Five people are trapped at {p}.', 'Correction to my count at {p}: two people, not five, are trapped.', C, H),
 ('The pump at {p} needs fuel.', 'I gave the wrong item for {p}: we need a hose, not fuel. All safe.', C, D),
 ('Someone fell at the east gate of {p}.', 'I meant the west gate of {p}, not east; the person is still injured.', C, H),
 ('The walkway at {p} is closed.', 'Correcting my message: the walkway at {p} is open. No one needs help.', C, I),
 ('Four workers were injured at {p}.', 'Amending the earlier number from {p}: one injury, not four.', C, H)],
 'partial_clear': [
 ('People are trapped in both sections of {p}.', 'The front section of {p} is empty now; the back section is unchecked.', C, H),
 ('Three workers at {p} are missing.', 'Two of the three workers at {p} are safe; one is still unaccounted for.', C, H),
 ('Both exits at {p} are blocked with people inside.', 'Only the north exit at {p} has been cleared; people remain behind the south door.', C, H),
 ('People may be in the flooded tunnels at {p}.', 'The first tunnel at {p} is clear. We have not searched the other tunnel.', C, H),
 ('Several people at {p} need evacuation.', 'One group left {p} safely, but another group is still waiting in rising water.', C, H)],
 'hearsay': [
 ('', 'A driver told me someone might be trapped at {p}; I cannot verify it.', N, H),
 ('', 'I heard there may be injured people at {p}, not confirmed.', N, H),
 ('', 'Someone says something happened somewhere past the junction, no other detail.', R, H),
 ('', 'Secondhand report of calls for help near {p}; the source has left.', N, H),
 ('', 'A passerby thinks a person is stranded at {p}. I have not seen them myself.', N, H)],
 'negation': [
 ('', 'No injuries at {p}; everyone checked in, no help requested.', N, I),
 ('', 'The people at {p} are not trapped, but need replacement blankets; all are safe.', N, D),
 ('', 'There is no fire at {p}, but one person is unconscious.', N, H),
 ('', 'No smoke or injuries at {p}; this is only a routine status report.', N, I),
 ('', 'Nobody is missing at {p}; the headcount is complete and there is no open need.', N, I)],
 'rescue_question': [
 ('', 'Can a rescue crew reach {p}? Two people cannot get out.', N, H),
 ('', 'Has anyone sent a boat to {p}? We are stuck above the water.', N, H),
 ('A person is stranded at {p}.', 'Any update on rescue for the person stranded at {p}?', A, H),
 ('', 'Who can help lift the beam at {p}? Someone is underneath it.', N, H),
 ('', 'Is a medic coming to {p}? A person is struggling to breathe.', N, H)],
 'nearby_separate': [
 ('A worker is trapped at {p}.', 'Separate incident at {q}, next to {p}: a visitor is injured.', N, H),
 ('The crew at {p} needs gloves.', 'The crew at {q} also needs gloves. Different crew and location, all safe.', N, D),
 ('There is smoke at {p}.', 'At {q}, across from {p}, a fallen tree has trapped someone. This is a separate problem.', N, H),
 ('A person is hurt at {p}.', 'Routine update from nearby {q}: all safe and no assistance needed here.', N, I),
 ('Two people are stuck at {p}.', 'Another pair is stuck at {q}, a different site a short walk away.', N, H)],
 'late_old': [
 ('The fire at {p} was extinguished at 14:00; everyone safe.', 'Delayed message from 12:00: smoke at {p}. This describes before the all-clear.', A, I),
 ('The crew at {p} received water at 14:00.', 'Old queued message from 11:00: water requested at {p}; delivery is already confirmed.', A, I),
 ('People at {p} were rescued at 15:00.', 'Forwarding an old 10:00 report of people stranded at {p}; it predates the rescue.', A, I),
 ('The route at {p} reopened at 16:00.', 'Late arrival of my 09:00 message: the route at {p} was blocked then. No new obstruction reported.', A, I),
 ('The trapped worker at {p} was freed at 13:00.', 'This is yesterday morning\'s message about the worker trapped at {p}, not a fresh incident.', A, I)],
 'conflict': [
 ('All workers at {p} have left safely.', 'I am at {p} now and can see a worker still trapped. The all-clear is wrong.', F, H),
 ('The path at {p} is open.', 'That report of an open path at {p} is false; I see it completely blocked.', F, D),
 ('Supplies reached {p}.', 'No supplies have arrived at {p}; the delivery confirmation conflicts with what we see.', F, D),
 ('Nobody at {p} is injured.', 'The no-injuries report at {p} contradicts my observation: one person is bleeding.', F, H),
 ('The machinery at {p} has been switched off safely.', 'The machine at {p} is still running with a person caught in it, contrary to the shutdown report.', F, H)],
}
PLACES = [('granite quarry', 'clay pit'), ('canal lock', 'towpath bend'), ('freight yard', 'loading pier'), ('orchard gate', 'packing shed')]


def job(prior, target, category, index):
    def report(rid, text, seq):
        return dict(reportId=rid, text=text, receiveSequence=seq, sentAt=None, reportedEventAt=None, reportedLocation=None)
    reports = [report('rep-prior', prior, 1)] if prior else []
    candidates = []
    if prior:
        attention = I if category == 'late_old' else H if any(w in prior for w in ('trapped', 'injured', 'missing', 'people', 'person', 'workers inside')) else D
        candidates = [dict(runId='run-synthetic', incidentId='inc-existing', revision=1, status='OPEN',
                           attention=attention, confirmedPlaceId=None, confirmedReportIds=['rep-prior'],
                           summary=None, openCycleStartSequence=1)]
    reports.append(report('rep-target', target, 2))
    return dict(runId='run-synthetic', jobId=f'job-{index}', kind='LOCAL_SUGGESTION', inputSignature=f'synthetic-{index}',
                targetReportId='rep-target', incidentId=None, reports=reports, candidateIncidents=candidates, places=[])


def main():
    rows = []
    for category, scenarios in SCENARIOS.items():
        for template, (prior, target, action, attention) in enumerate(scenarios):
            for p, q in PLACES:
                rows.append(dict(id=f'syn-{len(rows):03}', group=f'{category}-{template}', category=category,
                                 split='val' if template == 4 else 'train', action=action, attention=attention,
                                 job=job(prior.format(p=p, q=q), target.format(p=p, q=q), category, len(rows))))
    assert len(rows) == 200 and sum(r['split'] == 'val' for r in rows) == 40
    assert not {r['group'] for r in rows if r['split'] == 'train'} & {r['group'] for r in rows if r['split'] == 'val'}
    Path(__file__).with_name('train.jsonl').write_text(''.join(json.dumps(row) + '\n' for row in rows))


if __name__ == '__main__':
    main()
