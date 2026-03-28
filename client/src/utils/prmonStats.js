export function getHpColor(hp, maxHp) {
  const pct = hp / maxHp;
  if (pct > 0.5) return 'green';
  if (pct > 0.2) return 'yellow';
  return 'red';
}

export function getHpPct(hp, maxHp) {
  return Math.max(0, Math.min(100, (hp / maxHp) * 100));
}

export function getTypeClass(type) {
  if (!type) return 'type-normal';
  return `type-${type.name.toLowerCase()}`;
}

export const MOVE_INFO = {
  lgtm: { name: 'LGTM', damage: '30', desc: 'Reliable attack' },
  nitpick: { name: 'NITPICK', damage: '10+DOT', desc: 'Poison 5dmg x3' },
  request_changes: { name: 'REQ CHANGES', damage: '50', desc: 'Enrages foe' },
  force_push: { name: 'FORCE PUSH', damage: '99', desc: '50 recoil!' },
};
