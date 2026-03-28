export default function PRmonSprite({ prmon, isEnemy = false, damaged = false }) {
  const typeColor = prmon.type?.color || '#a8a878';

  return (
    <div className={`prmon-sprite ${damaged ? 'damage-flash' : ''}`}>
      <div className="sprite-blob">
        <div
          className="blob-body"
          style={{ background: typeColor }}
        />
        <img
          className="sprite-avatar"
          src={prmon.authorAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${prmon.name}`}
          alt={prmon.authorName}
          onError={(e) => {
            e.target.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${prmon.name}`;
          }}
        />
      </div>
    </div>
  );
}
