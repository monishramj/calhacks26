"""Build the Outer Sunset exercise from one authored table.

Writes:
  fixtures/private/exercise/exercise.json      places and report events (what the live run receives)
  fixtures/private/exercise/expectations.json  authored labels per report (tests only, never model input)
  fixtures/replay/sunset-exercise.json         replay fixture + team tracks, relays, estimated packet sizes

Team tracks follow the real street graph in apps/web/src/scene/sunset.json. Packet sizes are ESTIMATED from the
400 measured LLM-codec packets in services/codec-radio/data/replay_400.jsonl (linear fit on text bytes); the UI
labels them as estimates. All reports are synthetic. Run: python3 scripts/build_scenario.py
"""
import heapq, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = json.loads((ROOT / 'apps/web/src/scene/sunset.json').read_text())
START = '2026-10-25T18:00:00Z'
DURATION = 60 * 60
WALK, DRIVE = 1.4, 7.0  # m/s

# id: (label, kind) — kind 'truck' teams drive.
TEAMS = {
    'team-01': ('School team A', 'walk'), 'team-02': ('School team B', 'walk'), 'team-03': ('Judah west team', 'walk'),
    'team-04': ('North shelter crew', 'walk'), 'team-05': ('Judah east team', 'walk'), 'team-06': ('Lawton team', 'walk'),
    'team-07': ('Moraga east team', 'walk'), 'team-08': ('Lawton west team', 'walk'), 'team-09': ('Judah middle team', 'walk'),
    'team-10': ('Beach patrol', 'walk'), 'team-11': ('Kirkham team', 'walk'), 'team-12': ('South shelter crew', 'walk'),
    'team-13': ('Supply truck 1', 'truck'), 'team-14': ('Supply truck 2', 'truck'), 'team-15': ('Medic team', 'truck'),
    'team-16': ('Utility check team', 'truck'),
}

LS, NEED, INFO = 'POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION'
NEW, ATTACH, CORR, REVIEW = 'NEW_INCIDENT', 'ATTACH_REPORT', 'FLAG_CORRECTION', 'REQUEST_REVIEW'

# (time, key, team, place or None, text, incident, attention, action, relation (kind, target key) or None, note)
# `time` is when the report is transmitted. A report with `held` was written earlier while the team's radio was out
# of coverage, and keeps that earlier sent time (the late older report).
R = [
    ('00:40', 'gym-clear', 'team-01', 'school', 'School gym evacuation complete. Everyone our team checked is outside.', 'INC-school', INFO, NEW, None, 'Limited source claim: does not prove every school building is clear.'),
    ('01:30', 'n-shelter-open', 'team-04', 'north-shelter', 'North shelter open at the church hall. 18 people here, blankets needed tonight.', 'INC-north-shelter', NEED, NEW, None, 'Active supply need.'),
    ('02:10', 'h47-water', 'team-03', 'house-47-judah', 'House on 47th near Judah: water rising downstairs, two people waiting upstairs.', 'INC-house-47-judah', LS, NEW, None, 'Possible life-safety concern.'),
    ('03:00', 'h44-wire', 'team-09', 'house-44-judah', '44th and Judah: power line down on the sidewalk, sparking. Keeping people back.', 'INC-house-44-judah', LS, NEW, None, 'Possible life-safety hazard.'),
    ('03:40', 'apt-power', 'team-05', 'apartments', 'Apartment block on Judah: power out, elevator stuck between floors, nobody inside it.', 'INC-apartments', INFO, NEW, None, 'Status only; nobody in the elevator.'),
    ('04:30', 'h43-cold', 'team-06', 'house-43-lawton', 'House on 43rd near Lawton: elderly man alone, no heat, needs blankets.', 'INC-house-43-lawton', NEED, NEW, None, 'Active need.'),
    ('05:15', 'gym-searched', 'team-02', 'school', 'School sports hall checked. Our search of that area is complete.', 'INC-school', INFO, ATTACH, ('UPDATE', 'gym-clear'), 'Same gym subarea; keep source scope.'),
    ('06:00', 'h41-gas', 'team-07', 'house-41-moraga', 'Strong smell of gas at 41st and Moraga. We told neighbors to stay out.', 'INC-house-41-moraga', LS, NEW, None, 'Possible life-safety hazard.'),
    ('06:45', 'n-shelter-repeat', 'team-04', 'north-shelter', 'Repeating: north shelter still needs blankets tonight.', 'INC-north-shelter', NEED, ATTACH, ('REPEAT', 'n-shelter-open'), 'Repeat: no new incident, no extra heat.'),
    ('07:30', 'grocery-water', 'team-14', 'grocery', 'Grocery store at 45th and Judah is open, giving out bottled water.', 'INC-grocery', INFO, NEW, None, 'Resource information.'),
    ('08:20', 'h46l-basement', 'team-08', 'house-46-lawton', '46th and Lawton: basement flooding, family pumping water, they need sandbags.', 'INC-house-46-lawton', NEED, NEW, None, 'Active need.'),
    ('09:00', 'h47-help', 'team-03', 'house-47-judah', '47th and Judah: the people upstairs have asked for help, water still rising.', 'INC-house-47-judah', LS, ATTACH, ('UPDATE', 'h47-water'), 'Update to the same house.'),
    ('09:50', 'h48-dog', 'team-10', 'house-48-kirkham', 'House on 48th near Kirkham: dog trapped in the flooded garage. Owner is safe.', 'INC-house-48-kirkham', NEED, NEW, None, 'Animal rescue need; owner safe.'),
    ('10:40', 'hw-sandbags', 'team-13', 'hardware-store', 'Hardware store at 43rd and Lawton has sandbags. We need a truck to move them.', 'INC-hardware-store', NEED, NEW, None, 'Resource with a transport need.'),
    ('11:30', 'apt-oxygen', 'team-05', 'apartments', 'Apartment block: two residents on the 4th floor use oxygen machines, batteries running low.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-power'), 'Raises attention to possible life safety: needs a human.'),
    ('12:15', 'cafe-food', 'team-09', 'cafe', 'Beach cafe staff are staying. We can serve hot food to about 30 people.', 'INC-cafe', INFO, NEW, None, 'Resource information.'),
    ('13:00', 'school-upstairs', 'team-01', 'school', 'Correction: the school gym is clear, but someone may still be upstairs in the main building.', 'INC-school', LS, CORR, ('CORRECTION', 'gym-clear'), '"May" is not a confirmed person; possible life safety.'),
    ('13:40', 'h44-repeat', 'team-16', 'house-44-judah', 'Repeating 44th and Judah: live wire on the sidewalk, still sparking.', 'INC-house-44-judah', LS, ATTACH, ('REPEAT', 'h44-wire'), 'Repeat: no extra heat.'),
    ('14:30', 'dunes-shout', 'team-10', None, 'Someone is shouting for help near the dunes. We cannot see where.', 'INC-dunes', LS, NEW, None, 'No known place: stays unplaced.'),
    ('15:10', 's-shelter-open', 'team-12', 'south-shelter', 'South shelter open at the church hall on Moraga. 25 people, we need cots.', 'INC-south-shelter', NEED, NEW, None, 'Active need.'),
    ('15:50', 'school-repeat', 'team-02', 'school', 'Repeating the school report: possible person upstairs in the main building.', 'INC-school', LS, ATTACH, ('REPEAT', 'school-upstairs'), 'Repeat of the concern; no headcount added.'),
    ('16:40', 'h42-door', 'team-05', 'house-42-judah', '42nd and Judah: neighbor not answering her door, lights off since this morning.', 'INC-house-42-judah', LS, NEW, None, 'Uncertain possible harm.'),
    ('17:20', 'h45-tree', 'team-11', 'house-45-kirkham', '45th and Kirkham: tree fell on the roof. Family is safe, roof leaking.', 'INC-house-45-kirkham', NEED, NEW, None, 'Need; family safe.'),
    ('18:00', 'n-shelter-water', 'team-14', 'north-shelter', 'Truck delivered 40 bottles of water to the north shelter.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-open'), 'Delivery; blankets still open.'),
    ('18:45', 'h40-car', 'team-07', 'house-40-moraga', '40th and Moraga: car stuck in the flooded intersection, water at the doors, driver still inside.', 'INC-house-40-moraga', LS, NEW, None, 'Possible life safety.'),
    ('19:30', 'apt-medic', 'team-15', 'apartments', 'Medic team at the apartment block. Oxygen users stable for now, need batteries within two hours.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-oxygen'), 'Stable for now is not resolved; keep attention.'),
    ('20:15', 'school-main', 'team-01', 'school', 'School report refers to the main building beside the gym.', 'INC-school', None, ATTACH, ('UPDATE', 'school-upstairs'), 'Subarea clarification only.'),
    ('21:00', 'h46l-bags', 'team-13', 'house-46-lawton', 'Sandbags delivered to 46th and Lawton. Basement water holding.', 'INC-house-46-lawton', INFO, ATTACH, ('UPDATE', 'h46l-basement'), 'Need met for now.'),
    ('21:40', 'hw-left', 'team-06', 'hardware-store', 'Hardware store: 60 sandbags left, truck can take more.', 'INC-hardware-store', NEED, ATTACH, ('UPDATE', 'hw-sandbags'), 'Resource update.'),
    ('22:30', 'motel-ok', 'team-03', 'motel', 'Beach motel: ground floor flooded, guests moved upstairs, all accounted for.', 'INC-motel', INFO, NEW, None, 'Source claim of all accounted for.'),
    ('23:10', 'dunes-repeat', 'team-10', None, 'Repeating: shouting for help near the dunes, south of the beach parking lot.', 'INC-dunes', LS, ATTACH, ('REPEAT', 'dunes-shout'), 'Still no known place.'),
    ('24:00', 's-shelter-more', 'team-08', 'south-shelter', 'South shelter: 12 more people arrived, now 37. Still need cots and water.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-open'), 'Need grows; one incident.'),
    ('24:40', 'school-question', 'team-02', 'school', 'Has everyone at the school been rescued?', 'INC-school', None, REVIEW, None, 'A question, not a confirmation of a person or a rescue.'),
    ('25:20', 'h41-off', 'team-16', 'house-41-moraga', '41st and Moraga: gas company crew is here, the gas is shut off. Neighbors can go back.', 'INC-house-41-moraga', INFO, ATTACH, ('UPDATE', 'h41-gas'), 'Lowers a life-safety incident: needs a human.'),
    ('26:00', 'gym-late', 'team-11', 'school', 'Earlier school gym report: all people our team checked were outside.', 'INC-school', None, ATTACH, ('UPDATE', 'gym-clear'), 'Late older report: must not lower the newer upstairs concern.', '09:30'),
    ('26:40', 'h46m-fine', 'team-12', 'house-46-moraga', '46th and Moraga: checked the whole block, everyone is fine.', 'INC-house-46-moraga', INFO, NEW, None, 'Status only.'),
    ('27:20', 'h40-out', 'team-07', 'house-40-moraga', '40th and Moraga: driver is out of the car and safe. Car still in the water.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-car'), 'Lowers a life-safety incident: needs a human.'),
    ('28:00', 'h42-fine', 'team-05', 'house-42-judah', 'Correction for 42nd and Judah: the neighbor answered. She is fine, her phone was dead.', 'INC-house-42-judah', INFO, CORR, ('CORRECTION', 'h42-door'), 'Correction: needs a human.'),
    ('28:45', 'h47-out', 'team-15', 'house-47-judah', 'Medic team at 47th and Judah. Both residents out, in our truck, mild cold.', 'INC-house-47-judah', INFO, ATTACH, ('UPDATE', 'h47-help'), 'Lowers a life-safety incident: needs a human.'),
    ('29:30', 'cafe-soup', 'team-09', 'cafe', 'Beach cafe: hot soup ready, can send to the shelters.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-food'), 'Resource update.'),
    ('30:10', 'motel-missing', 'team-03', 'motel', 'Correction from the beach motel: one guest from room 12 is missing. Was not upstairs.', 'INC-motel', LS, CORR, ('CORRECTION', 'motel-ok'), 'Correction raising possible life safety.'),
    ('30:50', 'h48-dog-out', 'team-10', 'house-48-kirkham', '48th and Kirkham: dog is out of the garage, owner has it.', 'INC-house-48-kirkham', INFO, ATTACH, ('UPDATE', 'h48-dog'), 'Need met.'),
    ('31:30', 'grocery-low', 'team-04', 'grocery', 'Grocery store: water running low, about 50 bottles left.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-water'), 'Resource update.'),
    ('32:10', 'h46l-repeat', 'team-08', 'house-46-lawton', 'Repeating 46th and Lawton: basement water holding with sandbags.', 'INC-house-46-lawton', INFO, ATTACH, ('REPEAT', 'h46l-bags'), 'Repeat: no extra heat.'),
    ('32:50', 'school-not-done', 'team-11', 'school', 'School main building search is not complete. We cannot give an all-clear.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-upstairs'), 'Unresolved: do not mark resolved.'),
    ('33:30', 'h43-moved', 'team-06', 'house-43-lawton', '43rd and Lawton: elderly man moved to the south shelter with blankets.', 'INC-house-43-lawton', INFO, ATTACH, ('UPDATE', 'h43-cold'), 'Need met.'),
    ('34:10', 'h44-safe', 'team-16', 'house-44-judah', '44th and Judah: utility crew has cut power to the line. Area is safe.', 'INC-house-44-judah', INFO, ATTACH, ('UPDATE', 'h44-wire'), 'Lowers a life-safety incident: needs a human.'),
    ('34:50', 's-shelter-cots', 'team-12', 'south-shelter', 'South shelter received 20 cots. Still need water for 37 people.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-more'), 'Need continues.'),
    ('35:30', 'dunes-found', 'team-10', None, 'Found the person near the dunes: a surfer with a hurt ankle, walking him to the parking lot.', 'INC-dunes', LS, ATTACH, ('UPDATE', 'dunes-shout'), 'Injury: keep for a human.'),
    ('36:10', 'apt-batteries', 'team-05', 'apartments', 'Apartment block: batteries arrived for the oxygen machines.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-medic'), 'Lowers a life-safety incident: needs a human.'),
    ('36:50', 'h45-tarp', 'team-11', 'house-45-kirkham', '45th and Kirkham: tarp on the roof, leak stopped.', 'INC-house-45-kirkham', INFO, ATTACH, ('UPDATE', 'h45-tree'), 'Need met.'),
    ('37:30', 'motel-repeat', 'team-03', 'motel', 'Repeating: motel guest from room 12 still missing.', 'INC-motel', LS, ATTACH, ('REPEAT', 'motel-missing'), 'Repeat: no extra heat.'),
    ('38:10', 'grocery-repeat', 'team-14', 'grocery', 'Repeating grocery store: about 50 bottles of water left.', 'INC-grocery', INFO, ATTACH, ('REPEAT', 'grocery-low'), 'Repeat.'),
    ('38:50', 'h41-clear', 'team-07', 'house-41-moraga', '41st and Moraga all clear, gas off, residents back home.', 'INC-house-41-moraga', INFO, ATTACH, ('UPDATE', 'h41-off'), 'Status update.'),
    ('39:30', 'hw-out', 'team-13', 'hardware-store', 'Hardware store: out of sandbags now.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-left'), 'Resource update.'),
    # Extended exercise (sunset-2): more traffic per place, a second hour, more late older reports.
    ('07:05', 'school-parents', 'team-02', 'school', 'Parents gathering at the school gate asking about their kids. About 20 adults here.', 'INC-school', INFO, ATTACH, ('UPDATE', 'gym-clear'), 'Crowd information; no new harm claim.'),
    ('11:05', 'school-roster', 'team-01', 'school', 'School office says 212 students were on site today. Teachers have the roster outside.', 'INC-school', INFO, ATTACH, ('UPDATE', 'gym-clear'), 'Roster held by teachers; not a headcount check.'),
    ('14:05', 'school-stairs', 'team-11', 'school', 'School main building: stairwell door jammed, we cannot get to the second floor yet.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-upstairs'), 'Access blocked while a person may be upstairs.'),
    ('19:05', 'school-roster-short', 'team-01', 'school', 'School roster check: 210 of 212 students counted outside. Two not found yet.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-roster'), 'Two unaccounted for: possible life safety.'),
    ('22:05', 'school-roster-repeat', 'team-02', 'school', 'Repeating: school is missing two students on the roster.', 'INC-school', LS, ATTACH, ('REPEAT', 'school-roster-short'), 'Repeat.'),
    ('27:05', 'school-one-found', 'team-01', 'school', 'School: one of the two missing students was picked up early by a parent. One still not found.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-roster-short'), 'One remains unaccounted for.'),
    ('41:05', 'school-door-open', 'team-11', 'school', 'School main building: fire crew opened the jammed stairwell door. Going upstairs now.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-stairs'), 'Search in progress.'),
    ('43:25', 'school-found', 'team-11', 'school', 'School main building second floor: found one student hiding in a classroom, scared but not hurt.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-door-open'), 'Person found; check if this is the missing student.'),
    ('44:35', 'school-matched', 'team-01', 'school', 'School roster: the student found upstairs is the one we were missing. All 212 now accounted for.', 'INC-school', INFO, ATTACH, ('UPDATE', 'school-one-found'), 'Source claims full count; a human should confirm before resolving.'),
    ('47:05', 'school-floor-clear', 'team-11', 'school', 'School main building fully searched, all floors. Nobody else inside.', 'INC-school', INFO, ATTACH, ('UPDATE', 'school-not-done'), 'Search complete per this team.'),
    ('49:25', 'school-late-missing', 'team-02', 'school', 'School: two students still missing from the roster, please send help.', 'INC-school', LS, ATTACH, ('UPDATE', 'school-roster-short'), 'Late older report: must not override the newer full count.', '23:30'),
    ('52:05', 'school-parents-done', 'team-02', 'school', 'School gate: all parents have picked up their kids or are with the teachers.', 'INC-school', INFO, ATTACH, ('UPDATE', 'school-parents'), 'Status.'),
    ('59:15', 'school-closing', 'team-01', 'school', 'School: teachers and staff leaving, building locked.', 'INC-school', INFO, ATTACH, ('UPDATE', 'school-floor-clear'), 'Status.'),
    ('03:25', 'n-shelter-count', 'team-04', 'north-shelter', 'North shelter: 24 people now, two with small kids.', 'INC-north-shelter', NEED, ATTACH, ('UPDATE', 'n-shelter-open'), 'Need grows.'),
    ('10:05', 'n-shelter-meds', 'team-04', 'north-shelter', 'North shelter: a woman here needs her insulin, it is still at home on 45th.', 'INC-north-shelter', NEED, ATTACH, ('UPDATE', 'n-shelter-count'), 'Medication need.'),
    ('16:05', 'n-shelter-insulin-repeat', 'team-04', 'north-shelter', 'Repeating: insulin needed at the north shelter.', 'INC-north-shelter', NEED, ATTACH, ('REPEAT', 'n-shelter-meds'), 'Repeat.'),
    ('20:35', 'n-shelter-blankets', 'team-14', 'north-shelter', 'Truck dropped 30 blankets at the north shelter.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-open'), 'Blanket need met.'),
    ('25:55', 'n-shelter-insulin-ok', 'team-15', 'north-shelter', 'Medic team brought insulin to the north shelter. She has taken it, doing fine.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-meds'), 'Medication need met.'),
    ('33:05', 'n-shelter-full', 'team-04', 'north-shelter', 'North shelter: 41 people, the hall is getting full. We can take about 10 more.', 'INC-north-shelter', NEED, ATTACH, ('UPDATE', 'n-shelter-count'), 'Capacity concern.'),
    ('40:25', 'n-shelter-cold', 'team-04', 'north-shelter', 'North shelter heater stopped working. It is cold in the hall.', 'INC-north-shelter', NEED, ATTACH, ('UPDATE', 'n-shelter-full'), 'Need.'),
    ('45:05', 'n-shelter-heater', 'team-16', 'north-shelter', 'Utility team fixed the north shelter heater, hall warming up.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-cold'), 'Need met.'),
    ('50:35', 'n-shelter-food', 'team-04', 'north-shelter', 'North shelter: running out of food, 45 people for dinner.', 'INC-north-shelter', NEED, ATTACH, ('UPDATE', 'n-shelter-full'), 'Need.'),
    ('55:05', 'n-shelter-soup', 'team-09', 'north-shelter', 'Beach cafe soup delivered to the north shelter, enough for everyone tonight.', 'INC-north-shelter', INFO, ATTACH, ('UPDATE', 'n-shelter-food'), 'Need met.'),
    ('58:25', 'n-shelter-repeat-full', 'team-04', 'north-shelter', 'Repeating: north shelter almost full, about 45 people.', 'INC-north-shelter', NEED, ATTACH, ('REPEAT', 'n-shelter-full'), 'Repeat.'),
    ('17:55', 's-shelter-kid', 'team-12', 'south-shelter', 'South shelter: a child here has a high fever. Parents want a medic.', 'INC-south-shelter', LS, ATTACH, ('UPDATE', 's-shelter-open'), 'Possible medical issue.'),
    ('22:55', 's-shelter-medic', 'team-15', 'south-shelter', 'Medic at the south shelter checked the child with fever. Stable, gave medicine, will check again in an hour.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-kid'), 'Lowers attention: needs a human.'),
    ('26:05', 's-shelter-repeat-cots', 'team-12', 'south-shelter', 'Repeating: south shelter needs cots.', 'INC-south-shelter', NEED, ATTACH, ('REPEAT', 's-shelter-more'), 'Repeat.'),
    ('29:05', 's-shelter-water', 'team-14', 'south-shelter', 'Truck brought 60 bottles of water to the south shelter.', 'INC-south-shelter', INFO, ATTACH, ('UPDATE', 's-shelter-more'), 'Water need met for now.'),
    ('37:05', 's-shelter-elderly', 'team-12', 'south-shelter', 'South shelter: the elderly man from 43rd and Lawton arrived, warm now.', 'INC-south-shelter', INFO, ATTACH, ('UPDATE', 's-shelter-open'), 'Links to the Lawton house incident.'),
    ('42:05', 's-shelter-count', 'team-12', 'south-shelter', 'South shelter count: 52 people. Cots for 20, rest on mats.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-cots'), 'Need grows.'),
    ('46:25', 's-shelter-dog', 'team-08', 'south-shelter', 'South shelter: three families arrived with dogs, we need a spot for the animals.', 'INC-south-shelter', NEED, ATTACH, ('UPDATE', 's-shelter-count'), 'Need.'),
    ('51:05', 's-shelter-kid-ok', 'team-15', 'south-shelter', 'South shelter: child fever is down, doing well.', 'INC-south-shelter', INFO, ATTACH, ('UPDATE', 's-shelter-medic'), 'Medical concern easing.'),
    ('54:35', 's-shelter-cots2', 'team-13', 'south-shelter', 'Supply truck 1 delivered 30 more cots to the south shelter.', 'INC-south-shelter', INFO, ATTACH, ('UPDATE', 's-shelter-count'), 'Need met.'),
    ('57:35', 's-shelter-repeat', 'team-12', 'south-shelter', 'Repeating: south shelter has 52 people.', 'INC-south-shelter', INFO, ATTACH, ('REPEAT', 's-shelter-count'), 'Repeat.'),
    ('07:55', 'apt-stairs', 'team-05', 'apartments', 'Apartment block: stairwell lights out, residents using phone lights.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-power'), 'Status.'),
    ('14:55', 'apt-elderly', 'team-05', 'apartments', 'Apartment block 6th floor: elderly woman cannot walk down the stairs, wants to stay.', 'INC-apartments', NEED, ATTACH, ('UPDATE', 'apt-power'), 'Need.'),
    ('24:15', 'apt-water', 'team-05', 'apartments', 'Apartment block: water coming into the parking garage, about knee deep.', 'INC-apartments', NEED, ATTACH, ('UPDATE', 'apt-power'), 'Flooding.'),
    ('31:05', 'apt-car-garage', 'team-09', 'apartments', 'Apartment garage: someone may be sleeping in a car down there, residents saw him earlier.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-water'), '"May": uncertain possible harm.'),
    ('33:55', 'apt-garage-checked', 'team-05', 'apartments', 'Apartment garage checked. The car was empty, man had already left on foot.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-car-garage'), 'Lowers a possible life-safety concern: needs a human.'),
    ('39:05', 'apt-generator', 'team-16', 'apartments', 'Utility team set up a generator at the apartment block lobby for charging.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-batteries'), 'Resource.'),
    ('44:05', 'apt-elderly-ok', 'team-15', 'apartments', 'Apartment block 6th floor: checked the elderly woman, she has food and water, fine to stay.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-elderly'), 'Need met.'),
    ('48:35', 'apt-oxygen-again', 'team-05', 'apartments', 'Apartment block: one oxygen machine stopped again, generator cable too short to reach the 4th floor.', 'INC-apartments', LS, ATTACH, ('UPDATE', 'apt-batteries'), 'Raises again: possible life safety.'),
    ('50:55', 'apt-cable', 'team-16', 'apartments', 'Apartment block: ran a longer cable to the 4th floor. Both oxygen machines running.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-oxygen-again'), 'Lowers: needs a human.'),
    ('56:05', 'apt-repeat', 'team-05', 'apartments', 'Repeating: apartment oxygen machines running on generator.', 'INC-apartments', INFO, ATTACH, ('REPEAT', 'apt-cable'), 'Repeat.'),
    ('59:35', 'apt-night', 'team-05', 'apartments', 'Apartment block: residents settling in for the night, generator on.', 'INC-apartments', INFO, ATTACH, ('UPDATE', 'apt-generator'), 'Status.'),
    ('12:55', 'grocery-line', 'team-14', 'grocery', 'Grocery store at 45th and Judah: long line for water, about 60 people.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-water'), 'Status.'),
    ('19:55', 'grocery-fall', 'team-14', 'grocery', 'Grocery store: an older man slipped in the line and hit his head. He is awake.', 'INC-grocery', LS, ATTACH, ('UPDATE', 'grocery-line'), 'Head injury: possible life safety.'),
    ('21:55', 'grocery-generator', 'team-04', 'grocery', 'Grocery store running on a generator, freezers on.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-water'), 'Status.'),
    ('23:35', 'grocery-medic', 'team-15', 'grocery', 'Medic team at the grocery store, checked the man who fell. Small cut, no other injury.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-fall'), 'Lowers: needs a human.'),
    ('41:55', 'grocery-delivery', 'team-13', 'grocery', 'Supply truck 1 dropped 200 bottles of water at the grocery store.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-low'), 'Resource.'),
    ('47:55', 'grocery-closing', 'team-14', 'grocery', 'Grocery store closing at dark. Water handout moving to the north shelter.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-delivery'), 'Status.'),
    ('53:05', 'grocery-closed', 'team-14', 'grocery', 'Grocery store closed for the night.', 'INC-grocery', INFO, ATTACH, ('UPDATE', 'grocery-closing'), 'Status.'),
    ('31:55', 'motel-search', 'team-03', 'motel', 'Beach motel: searching the ground floor rooms for the missing guest from room 12.', 'INC-motel', LS, ATTACH, ('UPDATE', 'motel-missing'), 'Search in progress.'),
    ('33:25', 'motel-repeat2', 'team-10', 'motel', 'Repeating: motel room 12 guest missing, beach patrol told.', 'INC-motel', LS, ATTACH, ('REPEAT', 'motel-missing'), 'Repeat.'),
    ('35:05', 'motel-car', 'team-03', 'motel', 'Beach motel: the car of the room 12 guest is still in the lot.', 'INC-motel', LS, ATTACH, ('UPDATE', 'motel-missing'), 'Unresolved.'),
    ('40:55', 'motel-cafe', 'team-09', 'cafe', 'Man at the beach cafe says he is staying at the motel, room 12. He went out for food before the flood.', 'INC-motel', LS, ATTACH, ('UPDATE', 'motel-missing'), 'Cross-site: may be the missing guest; needs a human to confirm.'),
    ('43:05', 'motel-confirmed', 'team-03', 'motel', 'Beach motel manager confirmed: the man at the cafe is our room 12 guest. Everyone accounted for.', 'INC-motel', INFO, ATTACH, ('UPDATE', 'motel-cafe'), 'Lowers: needs a human.'),
    ('49:05', 'motel-water', 'team-03', 'motel', 'Beach motel: ground floor water going down slowly.', 'INC-motel', INFO, ATTACH, ('UPDATE', 'motel-ok'), 'Status.'),
    ('55:55', 'motel-late', 'team-10', 'motel', 'Motel guest from room 12 still missing, beach patrol searching the sand.', 'INC-motel', LS, ATTACH, ('UPDATE', 'motel-missing'), 'Late older report: must not override the newer all accounted for.', '36:00'),
    ('20:05', 'cafe-power', 'team-09', 'cafe', 'Beach cafe running on gas stove, no power. Still cooking.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-food'), 'Resource.'),
    ('34:35', 'cafe-volunteers', 'team-09', 'cafe', 'Beach cafe: 5 volunteers here, can drive food to the shelters.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-soup'), 'Resource.'),
    ('39:25', 'cafe-delivery', 'team-09', 'cafe', 'Beach cafe sent soup to the south shelter with a volunteer driver.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-volunteers'), 'Resource.'),
    ('46:05', 'cafe-burn', 'team-09', 'cafe', 'Beach cafe: a volunteer burned her hand on the stove, needs first aid.', 'INC-cafe', NEED, ATTACH, ('UPDATE', 'cafe-volunteers'), 'Minor injury need.'),
    ('48:05', 'cafe-burn-ok', 'team-15', 'cafe', 'Medic treated the burn at the beach cafe. Minor, she is back to work.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-burn'), 'Need met.'),
    ('53:55', 'cafe-out', 'team-09', 'cafe', 'Beach cafe: out of soup, will make more in an hour.', 'INC-cafe', INFO, ATTACH, ('UPDATE', 'cafe-soup'), 'Resource.'),
    ('06:25', 'corner-window', 'team-11', 'corner-store', 'Corner store: front window smashed by the wind, glass all over the sidewalk.', 'INC-corner-store', NEED, NEW, None, 'Hazard need.'),
    ('13:25', 'corner-glass', 'team-11', 'corner-store', 'Repeating corner store: broken glass on the sidewalk.', 'INC-corner-store', NEED, ATTACH, ('REPEAT', 'corner-window'), 'Repeat.'),
    ('21:25', 'corner-owner', 'team-06', 'corner-store', 'Corner store owner is here, sweeping glass. Says nobody was hurt.', 'INC-corner-store', INFO, ATTACH, ('UPDATE', 'corner-window'), 'Status.'),
    ('28:35', 'corner-batteries', 'team-06', 'corner-store', 'Corner store giving out batteries and flashlights.', 'INC-corner-store', INFO, ATTACH, ('UPDATE', 'corner-owner'), 'Resource.'),
    ('34:25', 'corner-glass-clean', 'team-06', 'corner-store', 'Corner store sidewalk swept, glass gone.', 'INC-corner-store', INFO, ATTACH, ('UPDATE', 'corner-window'), 'Hazard cleared.'),
    ('38:35', 'corner-batteries-out', 'team-06', 'corner-store', 'Corner store out of batteries.', 'INC-corner-store', INFO, ATTACH, ('UPDATE', 'corner-batteries'), 'Resource.'),
    ('45:55', 'corner-flood', 'team-11', 'corner-store', 'Corner store: water coming in the back door now.', 'INC-corner-store', NEED, ATTACH, ('UPDATE', 'corner-owner'), 'Need.'),
    ('52:55', 'corner-pump', 'team-13', 'corner-store', 'Supply truck brought a pump to the corner store. Water going down.', 'INC-corner-store', INFO, ATTACH, ('UPDATE', 'corner-flood'), 'Need met.'),
    ('15:35', 'hw-line', 'team-06', 'hardware-store', 'Hardware store: people lining up for sandbags, about 25.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-sandbags'), 'Status.'),
    ('26:25', 'hw-truck', 'team-13', 'hardware-store', 'Supply truck 1 loaded 80 sandbags at the hardware store.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-sandbags'), 'Resource.'),
    ('42:55', 'hw-restock', 'team-13', 'hardware-store', 'Hardware store: 200 more sandbags coming from the city yard in 30 minutes.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-out'), 'Resource.'),
    ('51:55', 'hw-arrived', 'team-13', 'hardware-store', 'Hardware store: city sandbags arrived, 200 ready.', 'INC-hardware-store', INFO, ATTACH, ('UPDATE', 'hw-restock'), 'Resource.'),
    ('57:05', 'hw-repeat', 'team-06', 'hardware-store', 'Repeating: 200 sandbags at the hardware store.', 'INC-hardware-store', INFO, ATTACH, ('REPEAT', 'hw-arrived'), 'Repeat.'),
    ('05:35', 'h47-stairs', 'team-03', 'house-47-judah', '47th and Judah: water at the second step of the stairs now.', 'INC-house-47-judah', LS, ATTACH, ('UPDATE', 'h47-water'), 'Rising.'),
    ('11:55', 'h47-boat', 'team-03', 'house-47-judah', '47th and Judah: we need a boat or high truck, street water too deep to walk.', 'INC-house-47-judah', LS, ATTACH, ('UPDATE', 'h47-help'), 'Access need.'),
    ('16:25', 'h47-repeat', 'team-03', 'house-47-judah', 'Repeating: 47th and Judah, two people upstairs, need a high truck.', 'INC-house-47-judah', LS, ATTACH, ('REPEAT', 'h47-boat'), 'Repeat.'),
    ('31:25', 'h47-empty', 'team-03', 'house-47-judah', '47th and Judah house is empty now, door locked.', 'INC-house-47-judah', INFO, ATTACH, ('UPDATE', 'h47-out'), 'Status.'),
    ('44:55', 'h47-shelter', 'team-15', 'house-47-judah', 'Both residents from 47th and Judah dropped at the north shelter, warm.', 'INC-house-47-judah', INFO, ATTACH, ('UPDATE', 'h47-out'), 'Resolved per source.'),
    ('58:05', 'h47-late', 'team-03', 'house-47-judah', '47th and Judah: water still rising, people upstairs, hurry.', 'INC-house-47-judah', LS, ATTACH, ('UPDATE', 'h47-help'), 'Late older report: must not override the newer rescue.', '12:30'),
    ('05:05', 'h44-crowd', 'team-09', 'house-44-judah', '44th and Judah: kids trying to get close to the wire. We are holding them back.', 'INC-house-44-judah', LS, ATTACH, ('UPDATE', 'h44-wire'), 'Hazard.'),
    ('09:25', 'h44-tape', 'team-09', 'house-44-judah', '44th and Judah: taped off the corner around the wire.', 'INC-house-44-judah', LS, ATTACH, ('UPDATE', 'h44-wire'), 'Hazard still live.'),
    ('15:05', 'h44-hedge', 'team-09', 'house-44-judah', '44th and Judah: sparks getting bigger, small fire in the hedge.', 'INC-house-44-judah', LS, ATTACH, ('UPDATE', 'h44-wire'), 'Hazard grows.'),
    ('16:55', 'h44-hedge-out', 'team-09', 'house-44-judah', '44th and Judah: hedge fire went out in the rain. Wire still live.', 'INC-house-44-judah', LS, ATTACH, ('UPDATE', 'h44-hedge'), 'Still a live wire.'),
    ('25:05', 'h44-crew', 'team-16', 'house-44-judah', 'Utility crew on the way to 44th and Judah, 10 minutes.', 'INC-house-44-judah', LS, ATTACH, ('UPDATE', 'h44-wire'), 'Still live.'),
    ('39:55', 'h44-tape-off', 'team-09', 'house-44-judah', '44th and Judah: tape taken down, sidewalk open.', 'INC-house-44-judah', INFO, ATTACH, ('UPDATE', 'h44-safe'), 'Status.'),
    ('51:25', 'h44-pole', 'team-16', 'house-44-judah', '44th and Judah: second pole leaning badly next to the first one. No wire down yet.', 'INC-house-44-judah', NEED, ATTACH, ('UPDATE', 'h44-safe'), 'New hazard on the same site.'),
    ('09:05', 'h43-meds', 'team-06', 'house-43-lawton', '43rd and Lawton: the elderly man says he is out of his heart pills.', 'INC-house-43-lawton', LS, ATTACH, ('UPDATE', 'h43-cold'), 'Medical need: possible life safety.'),
    ('18:25', 'h43-pills', 'team-15', 'house-43-lawton', 'Medic team brought heart pills to 43rd and Lawton. He has taken them.', 'INC-house-43-lawton', NEED, ATTACH, ('UPDATE', 'h43-meds'), 'Lowers: needs a human.'),
    ('26:55', 'h43-repeat', 'team-06', 'house-43-lawton', 'Repeating: 43rd and Lawton, elderly man needs blankets and heat.', 'INC-house-43-lawton', NEED, ATTACH, ('REPEAT', 'h43-cold'), 'Repeat.'),
    ('52:35', 'h43-late', 'team-08', 'house-43-lawton', '43rd and Lawton: elderly man alone with no heat, please check on him.', 'INC-house-43-lawton', NEED, ATTACH, ('UPDATE', 'h43-cold'), 'Late older report: he already moved to the shelter.', '05:00'),
    ('07:35', 'h41-hiss', 'team-07', 'house-41-moraga', '41st and Moraga: we can hear hissing by the meter. Smell is stronger.', 'INC-house-41-moraga', LS, ATTACH, ('UPDATE', 'h41-gas'), 'Hazard.'),
    ('10:25', 'h41-meter', 'team-07', 'house-41-moraga', '41st and Moraga: gas meter is on the side of the yellow house.', 'INC-house-41-moraga', LS, ATTACH, ('UPDATE', 'h41-gas'), 'Detail.'),
    ('12:35', 'h41-evac', 'team-07', 'house-41-moraga', '41st and Moraga: moved 8 neighbors to the end of the block.', 'INC-house-41-moraga', LS, ATTACH, ('UPDATE', 'h41-gas'), 'Hazard continues.'),
    ('17:05', 'h41-repeat', 'team-07', 'house-41-moraga', 'Repeating: gas smell at 41st and Moraga.', 'INC-house-41-moraga', LS, ATTACH, ('REPEAT', 'h41-gas'), 'Repeat.'),
    ('44:15', 'h41-check', 'team-16', 'house-41-moraga', '41st and Moraga: gas crew checked all houses on the block, no leaks found.', 'INC-house-41-moraga', INFO, ATTACH, ('UPDATE', 'h41-clear'), 'Status.'),
    ('08:55', 'h46l-pump', 'team-08', 'house-46-lawton', '46th and Lawton: their pump is too small, water still coming in.', 'INC-house-46-lawton', NEED, ATTACH, ('UPDATE', 'h46l-basement'), 'Need.'),
    ('11:25', 'h46l-power', 'team-08', 'house-46-lawton', '46th and Lawton: family asks if they should turn off the power, water near the outlets.', 'INC-house-46-lawton', LS, ATTACH, ('UPDATE', 'h46l-basement'), 'Electrical hazard: possible life safety.'),
    ('14:35', 'h46l-power-off', 'team-08', 'house-46-lawton', '46th and Lawton: we helped them turn off the main breaker.', 'INC-house-46-lawton', NEED, ATTACH, ('UPDATE', 'h46l-power'), 'Lowers: needs a human.'),
    ('36:35', 'h46l-neighbors', 'team-08', 'house-46-lawton', '46th and Lawton: two neighbor basements on the block flooding too.', 'INC-house-46-lawton', NEED, ATTACH, ('UPDATE', 'h46l-bags'), 'Need spreading on the block.'),
    ('46:55', 'h46l-bags2', 'team-13', 'house-46-lawton', 'More sandbags dropped on 46th and Lawton for the neighbors.', 'INC-house-46-lawton', INFO, ATTACH, ('UPDATE', 'h46l-neighbors'), 'Need met.'),
    ('55:25', 'h46l-dry', 'team-08', 'house-46-lawton', '46th and Lawton: all three basements holding, pumps running.', 'INC-house-46-lawton', INFO, ATTACH, ('UPDATE', 'h46l-bags2'), 'Status.'),
    ('13:55', 'h48-garage', 'team-10', 'house-48-kirkham', '48th and Kirkham: garage water about waist deep, we can hear the dog barking.', 'INC-house-48-kirkham', NEED, ATTACH, ('UPDATE', 'h48-dog'), 'Need.'),
    ('18:55', 'h48-repeat', 'team-10', 'house-48-kirkham', 'Repeating: dog trapped in garage at 48th and Kirkham.', 'INC-house-48-kirkham', NEED, ATTACH, ('REPEAT', 'h48-dog'), 'Repeat.'),
    ('42:35', 'h48-vet', 'team-10', 'house-48-kirkham', '48th and Kirkham: dog has a cut paw, owner wants a vet.', 'INC-house-48-kirkham', NEED, ATTACH, ('UPDATE', 'h48-dog-out'), 'Need.'),
    ('56:35', 'h48-vet-ok', 'team-15', 'house-48-kirkham', 'Medic team wrapped the dog paw at 48th and Kirkham, it is fine.', 'INC-house-48-kirkham', INFO, ATTACH, ('UPDATE', 'h48-vet'), 'Need met.'),
    ('20:55', 'h42-repeat', 'team-05', 'house-42-judah', 'Repeating: 42nd and Judah neighbor not answering her door.', 'INC-house-42-judah', LS, ATTACH, ('REPEAT', 'h42-door'), 'Repeat.'),
    ('24:55', 'h42-window', 'team-05', 'house-42-judah', '42nd and Judah: looked in the window, no one in the front room. Car is gone.', 'INC-house-42-judah', LS, ATTACH, ('UPDATE', 'h42-door'), 'Still uncertain.'),
    ('35:55', 'h42-shelter', 'team-12', 'house-42-judah', 'The neighbor from 42nd and Judah is at the south shelter, charging her phone.', 'INC-house-42-judah', INFO, ATTACH, ('UPDATE', 'h42-fine'), 'Status.'),
    ('47:35', 'h42-home', 'team-05', 'house-42-judah', '42nd and Judah neighbor is back home, thanked the team.', 'INC-house-42-judah', INFO, ATTACH, ('UPDATE', 'h42-shelter'), 'Status.'),
    ('54:05', 'h42-late', 'team-05', 'house-42-judah', '42nd and Judah: neighbor still not answering, we are worried.', 'INC-house-42-judah', LS, ATTACH, ('UPDATE', 'h42-door'), 'Late older report: must not override the newer correction.', '22:00'),
    ('19:25', 'h40-water', 'team-07', 'house-40-moraga', '40th and Moraga: intersection water about two feet deep, rising.', 'INC-house-40-moraga', LS, ATTACH, ('UPDATE', 'h40-car'), 'Hazard.'),
    ('23:05', 'h40-rope', 'team-07', 'house-40-moraga', '40th and Moraga: threw a rope to the driver, he is holding on, trying to get out.', 'INC-house-40-moraga', LS, ATTACH, ('UPDATE', 'h40-car'), 'Active rescue.'),
    ('32:35', 'h40-cones', 'team-07', 'house-40-moraga', '40th and Moraga: put cones out, cars turning around.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-out'), 'Status.'),
    ('36:55', 'h40-driver-ok', 'team-15', 'house-40-moraga', '40th and Moraga driver checked by medic, cold but no injury.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-out'), 'Status.'),
    ('40:05', 'h40-second-car', 'team-07', 'house-40-moraga', '40th and Moraga: second car drove into the water and stalled. Two people inside, water at the windows.', 'INC-house-40-moraga', LS, ATTACH, ('UPDATE', 'h40-cones'), 'New life-safety concern at the same site.'),
    ('41:35', 'h40-roof', 'team-07', 'house-40-moraga', '40th and Moraga: both people from the second car climbed out onto the roof. We are getting them a ladder.', 'INC-house-40-moraga', LS, ATTACH, ('UPDATE', 'h40-second-car'), 'Still possible life safety.'),
    ('45:35', 'h40-second-safe', 'team-15', 'house-40-moraga', '40th and Moraga: both people from the second car are on dry ground with the medic team. Cold but fine.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-roof'), 'Lowers: needs a human.'),
    ('58:55', 'h40-tow', 'team-07', 'house-40-moraga', '40th and Moraga: tow truck asked for both cars, water going down.', 'INC-house-40-moraga', INFO, ATTACH, ('UPDATE', 'h40-second-safe'), 'Status.'),
    ('22:35', 'h45-repeat', 'team-11', 'house-45-kirkham', 'Repeating: 45th and Kirkham, tree on the roof, leaking.', 'INC-house-45-kirkham', NEED, ATTACH, ('REPEAT', 'h45-tree'), 'Repeat.'),
    ('29:55', 'h45-line', 'team-11', 'house-45-kirkham', '45th and Kirkham: the tree also pulled the phone line down, it is lying in the yard.', 'INC-house-45-kirkham', NEED, ATTACH, ('UPDATE', 'h45-tree'), 'Need; a phone line, not power.'),
    ('53:25', 'h45-crack', 'team-11', 'house-45-kirkham', '45th and Kirkham: new crack in the ceiling under the tree. Family moved to the back room.', 'INC-house-45-kirkham', LS, ATTACH, ('UPDATE', 'h45-tarp'), 'Structural concern: possible life safety.'),
    ('57:55', 'h45-left', 'team-11', 'house-45-kirkham', '45th and Kirkham: family left for the south shelter until an inspector comes.', 'INC-house-45-kirkham', NEED, ATTACH, ('UPDATE', 'h45-crack'), 'Lowers: needs a human.'),
    ('37:55', 'h46m-water', 'team-12', 'house-46-moraga', '46th and Moraga: water starting to come up the driveways now.', 'INC-house-46-moraga', NEED, ATTACH, ('UPDATE', 'h46m-fine'), 'Need.'),
    ('43:55', 'h46m-bags', 'team-13', 'house-46-moraga', 'Sandbags dropped at 46th and Moraga.', 'INC-house-46-moraga', INFO, ATTACH, ('UPDATE', 'h46m-water'), 'Need met.'),
    ('50:05', 'h46m-couple', 'team-08', 'house-46-moraga', '46th and Moraga: one house has water inside, older couple on the ground floor wants to leave.', 'INC-house-46-moraga', LS, ATTACH, ('CONFLICT', 'h46m-fine'), 'Conflicts with the earlier everyone is fine.'),
    ('54:55', 'h46m-couple-out', 'team-12', 'house-46-moraga', '46th and Moraga: helped the older couple out, they are going to the south shelter.', 'INC-house-46-moraga', INFO, ATTACH, ('UPDATE', 'h46m-couple'), 'Lowers: needs a human.'),
    ('17:35', 'dunes-search', 'team-10', None, 'Beach patrol walking the dunes south of the parking lot, still hearing shouts.', 'INC-dunes', LS, ATTACH, ('UPDATE', 'dunes-shout'), 'Still unplaced.'),
    ('27:55', 'dunes-quiet', 'team-10', None, 'Dunes: shouting stopped. We keep searching.', 'INC-dunes', LS, ATTACH, ('UPDATE', 'dunes-shout'), 'Silence is not safety.'),
    ('38:05', 'dunes-medic', 'team-15', None, 'Medic team met the beach patrol at the parking lot. Surfer ankle likely broken, taking him to the clinic.', 'INC-dunes', NEED, ATTACH, ('UPDATE', 'dunes-found'), 'Lowers: needs a human.'),
    ('48:55', 'dunes-tide', 'team-10', None, 'Beach patrol: tide coming up into the dunes, keeping people off the beach.', 'INC-dunes', INFO, ATTACH, ('UPDATE', 'dunes-medic'), 'Status.'),
]

sec = lambda mmss: int(mmss[:2]) * 60 + int(mmss[3:])
iso = lambda s: f"2026-10-25T18:{s // 60:02d}:{s % 60:02d}Z"
places = {p['placeId']: p for p in MAP['places']}
command = MAP['commandPost']
# The dunes are open beach, not a place: the beach patrol walks to this point for those reports.
DUNES = (-560.0, 380.0)


def codec_fit():
    """Least-squares packet bytes ~ a + b * text bytes over the measured LLM-codec packets."""
    rows = [json.loads(l) for l in (ROOT / 'services/codec-radio/data/replay_400.jsonl').read_text().splitlines()]
    pts = [(r['raw_bytes'], r['packet_bytes']) for r in rows if r['method'] == 'llm' and r['decoded_ok']]
    n, sx, sy = len(pts), sum(x for x, _ in pts), sum(y for _, y in pts)
    b = (n * sum(x * y for x, y in pts) - sx * sy) / (n * sum(x * x for x, _ in pts) - sx * sx)
    return (sy - b * sx) / n, b, n


def road_graph():
    """Vertices merged on a 1 m grid; edges along every road polyline."""
    key = lambda x, z: (round(x), round(z))
    adj = {}
    for r in MAP['roads']:
        pts = list(zip(r['p'][0::2], r['p'][1::2]))
        for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
            a, b, d = key(x1, z1), key(x2, z2), math.dist((x1, z1), (x2, z2))
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    return adj


def route(adj, start, end):
    """Shortest street path between two points, plus the off-road legs to and from the nearest vertices."""
    near = lambda p: min(adj, key=lambda v: math.dist(v, p))
    s, e = near(start), near(end)
    dist, prev, heap = {s: 0}, {}, [(0, s)]
    while heap:
        d, v = heapq.heappop(heap)
        if v == e:
            break
        if d > dist[v]:
            continue
        for w, c in adj[v]:
            if d + c < dist.get(w, math.inf):
                dist[w], prev[w] = d + c, v
                heapq.heappush(heap, (d + c, w))
    path, v = [e], e
    while v != s:
        v = prev[v]
        path.append(v)
    return [start, *reversed(path), end]


def track(adj, kind, stops):
    """[t, x, z] samples: wait at each stop until its report, then travel to arrive 25 s before the next one."""
    speed = DRIVE if kind == 'truck' else WALK
    out = [[0, *stops[0][1]]]
    for (t0, p0), (t1, p1) in zip(stops, stops[1:]):
        path = route(adj, p0, p1)
        length = sum(math.dist(a, b) for a, b in zip(path, path[1:]))
        travel = length / speed
        leave = max(t0 + 10, t1 - 25 - travel)
        if leave + travel > t1:  # cannot make it walking: hurry (still recorded honestly in the track)
            travel = max(t1 - 5 - leave, 1)
        out.append([round(leave, 1), *p0])
        done = 0
        for a, b in zip(path, path[1:]):
            done += math.dist(a, b)
            out.append([round(leave + travel * done / length, 1), round(b[0], 1), round(b[1], 1)])
    out.append([DURATION, *out[-1][1:]])
    return out


def main():
    a, b, n = codec_fit()
    order = sorted(R, key=lambda r: sec(r[0]))
    ids = {r[1]: f'S{i + 1:02d}' for i, r in enumerate(order)}
    adj = road_graph()
    where = lambda r: (places[r[3]]['x'], places[r[3]]['z']) if r[3] else DUNES
    teams = []
    for tid, (label, kind) in TEAMS.items():
        mine = [r for r in order if r[2] == tid]
        stops = [(sec(r[0]), where(r)) for r in mine] + [(DURATION - 60, (command['x'], command['z']))]
        stops = [(max(0, stops[0][0] - 120), stops[0][1])] + stops
        teams.append({'teamId': tid, 'label': label, 'kind': kind, 'track': track(adj, kind, stops)})

    reports, authored, events, labels = {}, {}, [], {}
    for i, r in enumerate(order):
        t, key, team, place, text, inc, att, act, rel, note = r[:10]
        held = r[10] if len(r) > 10 else None
        mid, raw = ids[key], len(text.encode())
        sent = sec(held) if held else sec(t)
        reports[mid] = {'sourceId': team, 'placeId': place, 'sentAt': iso(sent), 'text': text, 'transmitAt': sec(t),
                        'heldSince': sec(held) if held else None, 'rawBytes': raw, 'packetBytes': round(a + b * raw)}
        rels = [{'kind': rel[0], 'target': ids[rel[1]]}] if rel else []
        candidate = inc if act in (ATTACH, CORR) else None
        authored[mid] = {
            'suggestion': {'action': act, 'candidateIncidentId': candidate, 'attention': att},
            'proposal': {'incidentId': inc, 'relations': rels, 'suggestedAttention': att, 'uncertainties': [note]} if candidate else None,
        }
        events.append({'position': i + 1, 'gate': None, 'gateRequiresIncident': None, 'radioCandidate': i == 0, 'input': {
            'sourceId': team, 'messageId': mid, 'text': text, 'origin': 'scenario', 'sentAt': iso(sent), 'reportedEventAt': None,
            'reportedLocation': {'placeId': place, 'source': 'sender_explicit'} if place else None,
            'transport': {'verification': 'not_applicable', 'encoding': 'not_applicable', 'measurementSource': 'not_applicable',
                          'originalBytes': None, 'applicationPacketBytes': None}}})
        labels[mid] = {'key': key, 'incidentId': inc, 'attention': att, 'action': act, 'relation': rels[0] if rels else None,
                       'interpretation': note}

    about = 'Synthetic Outer Sunset storm-flood exercise. Fictional; every report is authored. '
    (ROOT / 'fixtures/private/exercise/exercise.json').write_text(json.dumps({
        'exerciseVersion': 'sunset-2', 'about': about + 'What the live run receives, in transmit order.',
        'places': [{'placeId': p['placeId'], 'label': p['label'], 'position': {'x': p['x'], 'z': p['z']}, 'aliases': p['aliases'],
                    'subareas': [{'subareaId': 'school.gym', 'aliases': ['school gym', 'school sports hall']},
                                 {'subareaId': 'school.main_building', 'aliases': ['school main building', 'main building']}]
                    if p['placeId'] == 'school' else []} for p in MAP['places']],
        'startingState': {'afterMessageId': None, 'provenance': 'authored', 'about': 'Starts empty.', 'incidents': []},
        'events': events}, indent=1) + '\n')
    (ROOT / 'fixtures/private/exercise/expectations.json').write_text(json.dumps({
        'private': True, 'neverModelInput': True, 'provenance': 'authored',
        'about': 'Authored labels for the Outer Sunset exercise. Test assertions only; never Laya or Claude input.',
        'labels': labels,
        'invariants': {
            'lateOlderReport': {'report': ids['gym-late'], 'mustNotLower': 'INC-school', 'newerConcern': ids['school-upstairs']},
            'question': ids['school-question'],
            'unplaced': [ids[k] for k in ('dunes-shout', 'dunes-repeat', 'dunes-found')],
            'finalAttention': {inc: att for inc, att in {r[5]: r[6] for r in order if r[6]}.items()},
        }}, indent=1) + '\n')
    (ROOT / 'fixtures/replay/sunset-exercise.json').write_text(json.dumps({
        'label': 'Outer Sunset storm-flood exercise', 'about': about + 'Suggestions and proposals here are AUTHORED fixture '
        'outputs (provider fixture), not model results. Team tracks are simulated. Packet sizes are estimated: '
        f'packet bytes = {a:.1f} + {b:.3f} x text bytes, fit on {n} measured LLM-codec packets (replay_400.jsonl).',
        'exerciseVersion': 'sunset-2', 'startAt': START, 'durationSeconds': DURATION,
        'codecEstimate': {'intercept': round(a, 2), 'slope': round(b, 4), 'samples': n},
        'reports': reports, 'initial': {'deliver': [], 'incidents': []}, 'script': [ids[r[1]] for r in order],
        'authored': authored, 'teams': teams, 'relays': MAP['relays'], 'commandPost': command,
    }, separators=(',', ':')) + '\n')
    print(f'{len(order)} reports, {len({r[5] for r in order})} incidents, {len(teams)} teams; codec {a:.1f} + {b:.3f}x (n={n})')


if __name__ == '__main__':
    main()
