import { getHpColor, getHpPct } from '../utils/prmonStats';

export default function HPBar({ hp, maxHp, showNumbers = false }) {
  const pct = getHpPct(hp, maxHp);
  const color = getHpColor(hp, maxHp);

  return (
    <div className="hp-bar-container">
      <span className="hp-label">HP</span>
      <div className="hp-bar-track">
        <div
          className={`hp-bar-fill ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showNumbers && (
        <span className="hp-numbers">{hp}/{maxHp}</span>
      )}
    </div>
  );
}
