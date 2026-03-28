import { useState, useEffect } from 'react';
import { getTypeClass } from '../utils/prmonStats';

export default function PRmonList({ onSelect }) {
  const [prmons, setPrmons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchPRmons() {
    try {
      const res = await fetch('/api/prmons');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPrmons(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPRmons();
    const interval = setInterval(fetchPRmons, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading-text">Searching for wild PR-mons...</div>;
  }

  if (error) {
    return (
      <div className="empty-text">
        Could not connect to server.<br /><br />
        Make sure the server is running<br />
        on port 3001!
      </div>
    );
  }

  if (prmons.length === 0) {
    return (
      <div className="empty-text">
        No wild PR-mons found!<br /><br />
        Open some PRs in your repo<br />
        or check GITHUB_OWNER<br />
        and GITHUB_REPO env vars.
      </div>
    );
  }

  return (
    <div className="encounter-list">
      <h2>{'👾'} WILD PR-MONS NEARBY</h2>
      {prmons.map(prmon => (
        <button
          key={prmon.id}
          className="prmon-entry"
          onClick={() => onSelect(prmon)}
        >
          <img
            className="avatar"
            src={prmon.authorAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${prmon.name}`}
            alt={prmon.authorName}
            onError={(e) => {
              e.target.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${prmon.name}`;
            }}
          />
          <div className="info">
            <span className="name">{prmon.name}</span>
            <span className="details">
              #{prmon.prNumber} {prmon.prTitle}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="level">Lv.{prmon.level}</span>
            <br />
            <span className={`type-badge ${getTypeClass(prmon.type)}`}>
              {prmon.type?.badge} {prmon.type?.name}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
