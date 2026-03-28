import { useState, useRef, useCallback } from 'react';
import PRmonList from './components/PRmonList';
import BattleScreen from './components/BattleScreen';
import VictoryScreen from './components/VictoryScreen';
import DefeatScreen from './components/DefeatScreen';
import useBattle from './hooks/useBattle';
import useSound from './hooks/useSound';
import ARScreenImport from './components/ARScreen';
import { fetchPRmons as apiFetchPRmons } from './api/client';
import './styles/gameboy.css';

// ARScreen might be a null placeholder — check at runtime
const ARScreen = typeof ARScreenImport === 'function' ? ARScreenImport : null;

async function loadPRmons() {
  if (apiFetchPRmons) {
    return apiFetchPRmons();
  }
  const res = await fetch('/api/prmons');
  if (!res.ok) throw new Error('Failed to fetch PRmons');
  return res.json();
}

function TitleScreen({ onStart }) {
  return (
    <div className="title-screen" onClick={onStart}>
      <h1 className="title-bounce">PR-mon GO</h1>
      <div className="subtitle">Gotta Merge &apos;Em All! 🎮</div>
      <div className="tagline">A Stupid Hack for 2016</div>
      <div className="title-emoji float-updown">{'\u{1f47e}'}</div>
      <div className="blink-text">PRESS START</div>
    </div>
  );
}

// Fallback AR screen — simple list that lets you tap a prmon
function ARFallback({ prmons, onSelectPrmon, onBack }) {
  return (
    <div className="encounter-list ar-fallback">
      <h2>{'📡'} SCANNING FOR PR-MONS...</h2>
      <div className="radar-pulse-container">
        <div className="radar-pulse" />
      </div>
      {prmons.length === 0 && (
        <div className="loading-text">Searching for wild PR-mons...</div>
      )}
      {prmons.map(prmon => (
        <button
          key={prmon.id}
          className="prmon-entry"
          onClick={() => onSelectPrmon(prmon)}
        >
          <img
            className="avatar"
            src={prmon.authorAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${prmon.name}`}
            alt={prmon.authorName || prmon.name}
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
          </div>
        </button>
      ))}
      <button className="back-btn" onClick={onBack} style={{ marginTop: 8, width: '100%' }}>
        ← BACK
      </button>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('title');
  const [prevScreen, setPrevScreen] = useState(null);
  const [prmons, setPrmons] = useState([]);
  const [selectedPrmon, setSelectedPrmon] = useState(null);
  const { play } = useSound();

  const {
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
  } = useBattle();

  function changeScreen(next) {
    setPrevScreen(screen);
    setScreen(next);
  }

  async function handleStart() {
    play('select');
    try {
      // Attempt to load prmons first
      const data = await loadPRmons();
      setPrmons(data);

      // Check for WebXR AR support
      let arSupported = false;
      try {
        if (navigator.xr) {
          arSupported = await navigator.xr.isSessionSupported('immersive-ar');
        }
      } catch {
        // XR check failed
      }

      if (arSupported && ARScreen) {
        changeScreen('ar');
      } else {
        changeScreen('ar'); // Use AR fallback (the list-style scanner)
      }
    } catch {
      // If prmon fetch fails, go to list (PRmonList has its own fetch)
      changeScreen('list');
    }
  }

  async function handleSelectPrmon(prmon) {
    play('select');
    setSelectedPrmon(prmon);
    await startBattle(prmon.id);
    play('battle');
    changeScreen('battle');
  }

  function handleAttack(moveId) {
    play('hit');
    attack(moveId);
  }

  function handleRun() {
    runAway();
    clearBattle();
    changeScreen('ar');
  }

  function handleCatch() {
    play('catch');
    catchPrmon();
  }

  function handleVictoryBack() {
    play('victory');
    // Remove prmon from list only if it was caught (merged)
    if (selectedPrmon && battle?.status === 'caught') {
      setPrmons(prev => prev.filter(p => p.id !== selectedPrmon.id));
    }
    clearBattle();
    setSelectedPrmon(null);
    changeScreen('ar');
  }

  function handleDefeatBack() {
    play('defeat');
    clearBattle();
    setSelectedPrmon(null);
    changeScreen('ar');
  }

  function handleRetry() {
    if (selectedPrmon) {
      clearBattle();
      handleSelectPrmon(selectedPrmon);
    }
  }

  function handleBackToTitle() {
    clearBattle();
    setSelectedPrmon(null);
    setPrmons([]);
    changeScreen('title');
  }

  // Determine which screen to show based on battle state
  let currentScreen = screen;
  if (battle) {
    if (battle.status === 'won' || battle.status === 'caught') currentScreen = 'victory';
    else if (battle.status === 'lost') currentScreen = 'defeat';
    else if (battle.status === 'fled') {
      currentScreen = 'ar';
    } else currentScreen = 'battle';
  }

  // Choose the AR component
  const ARComponent = ARScreen || ARFallback;

  // AR screen renders fullscreen OUTSIDE the Game Boy shell
  if (currentScreen === 'ar') {
    return (
      <ARComponent
        prmons={prmons}
        onSelectPrmon={handleSelectPrmon}
        onBack={handleBackToTitle}
      />
    );
  }

  return (
    <div className="gameboy-shell">
      <div className="screen-bezel">
        <div className="game-screen scanlines">
          <div className="screen-fade-enter" key={currentScreen}>
            {currentScreen === 'title' && (
              <TitleScreen onStart={handleStart} />
            )}

            {currentScreen === 'list' && (
              <PRmonList onSelect={handleSelectPrmon} />
            )}

            {currentScreen === 'battle' && battle && (
              <BattleScreen
                battle={battle}
                animating={animating}
                lastHit={lastHit}
                turnMessages={turnMessages}
                onAttack={handleAttack}
                onRun={handleRun}
                onFinish={handleCatch}
              />
            )}

            {currentScreen === 'victory' && battle && (
              <VictoryScreen
                battle={battle}
                onCatch={handleCatch}
                onBack={handleVictoryBack}
                loading={loading}
                error={error}
              />
            )}

            {currentScreen === 'defeat' && battle && (
              <DefeatScreen
                battle={battle}
                onRetry={handleRetry}
                onBack={handleDefeatBack}
              />
            )}
          </div>
        </div>
      </div>

      {/* Decorative Game Boy controls */}
      <div className="controls-area">
        <div className="dpad">
          <div className="dpad-v" />
          <div className="dpad-h" />
          <div className="dpad-center" />
        </div>
        <div className="ab-buttons">
          <button className="ab-btn">B</button>
          <button className="ab-btn">A</button>
        </div>
      </div>
    </div>
  );
}
