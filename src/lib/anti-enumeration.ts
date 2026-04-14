const attemptsByIp = new Map<string, { ids: number[]; blockedUntil: number }>();

const BLOCK_MS = 60 * 60 * 1000;
const MAX_DISTINCT_IDS = 8;

export function evaluateEnumeration(ip: string, id: number): { allowed: boolean; score: number } {
  const now = Date.now();
  const state = attemptsByIp.get(ip) ?? { ids: [], blockedUntil: 0 };

  if (state.blockedUntil > now) return { allowed: false, score: 100 };

  state.ids.push(id);
  state.ids = state.ids.slice(-20);
  attemptsByIp.set(ip, state);

  const distinct = new Set(state.ids).size;
  let score = 0;
  if (distinct > MAX_DISTINCT_IDS) score += 70;

  const seq = [...state.ids].sort((a, b) => a - b);
  let sequentialJumps = 0;
  for (let i = 1; i < seq.length; i += 1) {
    if (seq[i] === seq[i - 1] + 1) sequentialJumps += 1;
  }
  if (sequentialJumps >= 4) score += 30;

  if (score >= 80) {
    state.blockedUntil = now + BLOCK_MS;
    attemptsByIp.set(ip, state);
    return { allowed: false, score };
  }

  return { allowed: true, score };
}
