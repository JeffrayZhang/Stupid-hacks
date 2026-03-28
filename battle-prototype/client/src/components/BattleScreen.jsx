import { useState, useEffect } from 'react';
import HPBar from './HPBar';
import PRmonSprite from './PRmonSprite';
import BattleText from './BattleText';
import MoveButtons from './MoveButtons';
import { getTypeClass } from '../utils/prmonStats';

export default function BattleScreen({ battle, animating, lastHit, turnMessages, onAttack, onRun, onFinish }) {
  const [shaking, setShaking] = useState(false);
  const [appeared, setAppeared] = useState(false);

  const prmon = battle.prmon;
  const canFinish = battle.status === 'won';

  useEffect(() => {
    setAppeared(true);
  }, []);

  useEffect(() => {
    if (lastHit) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 300);
      return () => clearTimeout(t);
    }
  }, [lastHit, turnMessages.length]);

  return (
    <div className={`battle-screen ${shaking ? 'shake' : ''}`}>
      {/* Enemy PR-mon (top right) */}
      <div className="enemy-area">
        <div className="enemy-info">
          <div className="enemy-name-row">
            <span className="creature-name">{prmon.name}</span>
            <span className={`type-badge ${getTypeClass(prmon.type)}`}>
              {prmon.type?.badge} {prmon.type?.name}
            </span>
          </div>
          <span className="creature-level">Lv.{prmon.level}</span>
          <HPBar hp={prmon.hp} maxHp={prmon.maxHp} />
        </div>
        <div className={appeared ? 'wild-appear' : ''}>
          <PRmonSprite
            prmon={prmon}
            isEnemy
            damaged={lastHit === 'player'}
          />
        </div>
      </div>

      {/* Player (bottom left) */}
      <div className="player-area">
        <div className="player-sprite slide-in-left">
          {'🧑‍💻'}
        </div>
        <div className="player-info">
          <span className="creature-name">REVIEWER</span>
          <span className="creature-level">Lv.99</span>
          <HPBar hp={battle.playerHp} maxHp={battle.playerMaxHp} showNumbers />
        </div>
      </div>

      <hr className="battle-divider" />

      {/* Battle text */}
      <BattleText messages={turnMessages} />

      {/* Move buttons */}
      <MoveButtons
        onAttack={onAttack}
        onRun={onRun}
        onFinish={onFinish}
        disabled={animating}
        canFinish={canFinish}
      />
    </div>
  );
}
