export default function DefeatScreen({ battle, onRetry, onBack }) {
  const prmon = battle.prmon;

  return (
    <div className="defeat-screen">
      <h2>{'💥'} DEFEATED {'💥'}</h2>
      <div style={{ fontSize: 40, margin: '10px 0' }}>{'😵'}</div>
      <div className="defeat-text">
        {prmon.name} was too powerful!<br />
        PR #{prmon.prNumber} remains unmerged...<br />
        <br />
        <em style={{ fontSize: 6 }}>
          &quot;Maybe request fewer changes next time...&quot;
        </em>
      </div>
      <button className="retry-btn" onClick={onRetry}>
        {'🔄'} TRY AGAIN
      </button>
      <button className="back-btn" onClick={onBack}>
        BACK TO LIST
      </button>
    </div>
  );
}
