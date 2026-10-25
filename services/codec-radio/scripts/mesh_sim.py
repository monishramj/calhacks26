"""Payload-size sweep in Meshtasticator (Meshtastic's discrete-event simulator).

Same node placements and seeds for every payload size, so differences come only from
packet length. Payload = text bytes + ~6 bytes protobuf overhead (+3 bytes codec header
for compressed variants: 1 method/version byte + CRC-16). The simulator adds the 16-byte
Meshtastic header itself.
usage: python3 mesh_sim.py <Meshtasticator dir> <out.json> <nodes> <period_s> <reps> <simtime_s>
"""
import json, os, random, sys

SIM_DIR, OUT = sys.argv[1], sys.argv[2]
NODES, PERIOD_S, REPS, SIMTIME_S = int(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), float(sys.argv[6])
sys.path.insert(0, SIM_DIR)
os.chdir(SIM_DIR)

from lib.config import Config
from lib.common import find_random_position
from lib.discrete_event_sim import DiscreteEventSim
from lib.node import NodeConfig
from lib.point import Point

PAYLOADS = {"raw text (83 B median)": 83 + 6, "Unishox2 (52 B)": 52 + 6 + 3, "LLM codec (18 B)": 18 + 6 + 3,
            "raw long msg (168 B p90)": 168 + 6, "LLM long msg (35 B)": 35 + 6 + 3}

class _Tmp:
    def __init__(self, conf, x, y):
        self.position = Point(x, y, conf.HM)

base = Config()
placements = []
for rep in range(REPS):
    random.seed(rep)
    while True:
        tmp = []
        for _ in range(NODES):
            x, y = find_random_position(base, tmp)
            if x is None:
                break
            tmp.append(_Tmp(base, x, y))
        if len(tmp) == NODES:
            break
    placements.append([(t.position.x, t.position.y) for t in tmp])

res = {"nodes": NODES, "period_s": PERIOD_S, "reps": REPS, "simtime_s": SIMTIME_S, "results": {}}
for label, plen in PAYLOADS.items():
    reach, coll, util = [], [], []
    for rep in range(REPS):
        conf = Config()
        conf.NR_NODES = NODES
        conf.PACKETLENGTH = plen
        conf.PERIOD = int(PERIOD_S * conf.ONE_SECOND_INTERVAL)
        conf.SIMTIME = int(SIMTIME_S * conf.ONE_SECOND_INTERVAL)
        conf.GUI_ENABLED = False
        conf.PLOT = False
        conf.update_router_dependencies()
        conf.SEED = rep
        random.seed(rep)
        ncs = [NodeConfig(node_id=i, position=Point(x, y, conf.HM), period=conf.PERIOD, tx_power=conf.PTX,
                          freq=conf.FREQ, antenna_gain=conf.GL, hop_limit=conf.hopLimit)
               for i, (x, y) in enumerate(placements[rep])]
        sim = DiscreteEventSim(conf, ncs)
        sim.run_simulation()
        r = sim.get_results()
        reach.append(r["nodeReach"] * 100)
        coll.append(r["collisionRate"] * 100)
        util.append(r["txAirUtilizationRate"])
    res["results"][label] = {"payload_bytes": plen, "reach_pct": sum(reach) / REPS, "reach_runs": reach,
                             "collision_pct": sum(coll) / REPS, "tx_air_util": sum(util) / REPS}
    print(label, json.dumps(res["results"][label]), flush=True)
json.dump(res, open(OUT, "w"), indent=1)
