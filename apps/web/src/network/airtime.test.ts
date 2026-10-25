import { airtimeMs, pHop } from './airtime';

describe('LoRa airtime (lora_math.py port)', () => {
  it('matches the Python formula for LongFast', () => {
    // python3 -c "import lora_math as m; print(round(m.airtime_ms(20,11,250,5),1), round(m.airtime_ms(83,11,250,5),1))"
    expect(airtimeMs(20)).toBeCloseTo(559.1, 1);
    expect(airtimeMs(83)).toBeCloseTo(1050.6, 1);
  });
  it('gives smaller packets a better chance on a busy channel', () => {
    const tbar = airtimeMs(83);
    expect(pHop(airtimeMs(20), tbar, .25)).toBeGreaterThan(pHop(airtimeMs(83), tbar, .25));
  });
});
