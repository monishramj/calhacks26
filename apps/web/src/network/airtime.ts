// LoRa time on air for Meshtastic LongFast, ported from services/codec-radio/scripts/lora_math.py.
const PREAMBLE = 16;
const MESH_HDR = 16;
const PB_OVERHEAD = 6;
export const LONG_FAST = { sf: 11, bwKhz: 250, crDen: 5 };

/** Milliseconds on air for an application payload of `bytes` (Meshtastic header and protobuf added). */
export function airtimeMs(bytes: number, { sf, bwKhz, crDen } = LONG_FAST) {
  const pl = MESH_HDR + PB_OVERHEAD + bytes;
  const tsym = (2 ** sf) / (bwKhz * 1000) * 1000;
  const de = tsym > 16 ? 1 : 0;
  const n = 8 + Math.max(Math.ceil((8 * pl - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * crDen, 0);
  return (PREAMBLE + 4.25) * tsym + n * tsym;
}

/** Chance one hop survives collisions when the channel is busy a fraction `u` of the time with traffic of mean airtime `tbar`. */
export const pHop = (t: number, tbar: number, u: number) => Math.exp(-u * (1 + t / tbar));
