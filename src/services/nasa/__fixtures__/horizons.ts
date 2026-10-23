// Fixture SINTÉTICA no formato da API Horizons (JSON com campo "result" e bloco $$SOE/$$EOE em CSV).
// Os números vêm do modelo analítico de Standish deste projeto — NÃO são dados baixados da NASA.
// Servem só para testar o parser e a validação sem rede.
import { standishState } from '../../../simulation/orbital/ephemeris';
import { isoToJd } from '../../../domain/units';
import type { BodyId } from '../../../data/bodies';

export const HEADER = `*******************************************************************************
Ephemeris / API_USER
Reference frame : ICRF
Center body name: Sun (10)
Output units    : KM-S
Reference plane : Ecliptic of J2000.0
*******************************************************************************
JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ,
`;

export function vectorLines(body: BodyId, startIso: string, days: number) {
  const jd0 = isoToJd(startIso);
  return Array.from({ length: days }, (_, i) => {
    const jd = jd0 + i;
    const s = standishState(body, jd);
    return `${jd.toFixed(9)}, A.D. ${startIso} 00:00:00.0000, ${[...s.r, ...s.v].map((x) => x.toExponential(16)).join(', ')},`;
  });
}

export function horizonsPayload(body: BodyId, startIso = '2026-10-01', days = 10, header = HEADER, lines = vectorLines(body, startIso, days)) {
  return { signature: { source: 'fixture sintética', version: '1.2' }, result: `${header}$$SOE\n${lines.join('\n')}\n$$EOE\n` };
}
