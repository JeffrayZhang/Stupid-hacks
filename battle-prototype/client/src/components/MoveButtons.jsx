import { MOVE_INFO } from '../utils/prmonStats';

export default function MoveButtons({ onAttack, onRun, disabled, canFinish, onFinish }) {
  return (
    <div className="move-panel">
      {canFinish && (
        <button
          className="move-btn finisher"
          onClick={onFinish}
          disabled={disabled}
        >
          <span className="move-name">{'🔴'} CATCH!</span>
          <span className="move-dmg">APPROVE + MERGE</span>
        </button>
      )}

      {Object.entries(MOVE_INFO).map(([id, move]) => (
        <button
          key={id}
          className="move-btn"
          onClick={() => onAttack(id)}
          disabled={disabled || canFinish}
        >
          <span className="move-name">{move.name}</span>
          <span className="move-dmg">{move.damage} - {move.desc}</span>
        </button>
      ))}

      <button
        className="move-btn run-btn"
        onClick={onRun}
        disabled={disabled}
      >
        {'🏃'} RUN AWAY
      </button>
    </div>
  );
}
