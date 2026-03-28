import { useState, useCallback, useRef } from 'react';

const API = '/api';

export default function useBattle() {
  const [battle, setBattle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [lastHit, setLastHit] = useState(null); // 'player' | 'enemy' | null
  const [turnMessages, setTurnMessages] = useState([]);
  const prevBattleRef = useRef(null);

  const startBattle = useCallback(async (prmonId) => {
    setLoading(true);
    setError(null);
    setTurnMessages([]);
    setLastHit(null);
    try {
      const res = await fetch(`${API}/battle/${prmonId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBattle(data);
      setTurnMessages(data.log || []);
      prevBattleRef.current = data;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const attack = useCallback(async (moveId) => {
    if (!battle || animating) return;
    setAnimating(true);
    setError(null);

    try {
      const res = await fetch(`${API}/battle/${battle.id}/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move: moveId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Figure out new messages since last state
      const prevLogLen = prevBattleRef.current?.log?.length || 0;
      const newMessages = data.log.slice(prevLogLen);
      prevBattleRef.current = data;

      // Animate messages sequentially
      for (let i = 0; i < newMessages.length; i++) {
        const msg = newMessages[i];
        if (msg === '---') {
          setLastHit('enemy');
          await delay(300);
          continue;
        }

        if (i === 0) setLastHit('player');
        setTurnMessages(prev => [...prev, msg]);
        await delay(600);
      }

      setBattle(data);

      await delay(300);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnimating(false);
      setLastHit(null);
    }
  }, [battle, animating]);

  const catchPrmon = useCallback(async () => {
    if (!battle) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/battle/${battle.id}/catch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBattle(data);
      setTurnMessages(prev => [...prev, ...data.log.slice(prevBattleRef.current?.log?.length || 0)]);
      prevBattleRef.current = data;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [battle]);

  const runAway = useCallback(async () => {
    if (!battle) return;
    try {
      const res = await fetch(`${API}/battle/${battle.id}/run`, { method: 'POST' });
      const data = await res.json();
      setBattle(data);
    } catch {
      // Just clear battle on error
      setBattle(null);
    }
  }, [battle]);

  const clearBattle = useCallback(() => {
    setBattle(null);
    setTurnMessages([]);
    setLastHit(null);
    setError(null);
    prevBattleRef.current = null;
  }, []);

  return {
    battle,
    loading,
    error,
    animating,
    lastHit,
    turnMessages,
    startBattle,
    attack,
    catchPrmon,
    runAway,
    clearBattle,
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
