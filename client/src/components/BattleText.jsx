import { useEffect, useRef } from 'react';

export default function BattleText({ messages }) {
  const containerRef = useRef(null);
  const lastMsg = messages[messages.length - 1] || '';

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="battle-text-box" ref={containerRef}>
      <div className="battle-text">
        {lastMsg}
        <span className="cursor">{'\u25bc'}</span>
      </div>
    </div>
  );
}
