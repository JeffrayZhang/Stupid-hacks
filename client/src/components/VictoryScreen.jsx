import { useState, useEffect } from 'react';

const CONFETTI_COLORS = ['#f08030', '#6890f0', '#78c850', '#f8d030', '#a040a0', '#f04038', '#48d048'];

function Confetti() {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const p = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * 1,
      size: 4 + Math.random() * 6,
    }));
    setPieces(p);
  }, []);

  return (
    <>
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            top: -10,
            background: p.color,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
          }}
        />
      ))}
    </>
  );
}

export default function VictoryScreen({ battle, onCatch, onBack, loading }) {
  const prmon = battle.prmon;
  const isCaught = battle.status === 'caught';

  return (
    <div className="victory-screen">
      <Confetti />
      {!isCaught ? (
        <>
          <h2>{'🎉'} VICTORY! {'🎉'}</h2>
          <div className="caught-name">{prmon.name}</div>
          <div className="caught-text">
            {prmon.name} fainted!<br />
            PR #{prmon.prNumber} is ready to be caught!
          </div>
          <button
            className="merge-btn"
            onClick={onCatch}
            disabled={loading}
          >
            {loading ? 'MERGING...' : '\u26be CATCH (MERGE)!'}
          </button>
          <br />
          <button className="back-btn" onClick={onBack} style={{ marginTop: 10 }}>
            BACK TO LIST
          </button>
        </>
      ) : (
        <>
          <h2>{'🌟'} GOTCHA! {'🌟'}</h2>
          <div className="caught-name">{prmon.name}</div>
          <div className="caught-text">
            {prmon.name} was caught!<br />
            PR #{prmon.prNumber} has been merged!<br />
            <br />
            {'🏆'} +{prmon.level * 10} XP earned!
          </div>
          <button className="back-btn" onClick={onBack}>
            CONTINUE
          </button>
        </>
      )}
    </div>
  );
}
