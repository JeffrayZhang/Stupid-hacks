import { useState } from 'react';
import PRmonList from './components/PRmonList';
import BattleScreen from './components/BattleScreen';
import VictoryScreen from './components/VictoryScreen';
import DefeatScreen from './components/DefeatScreen';
import useBattle from './hooks/useBattle';
import './styles/gameboy.css';

function TitleScreen({ onStart }) {
  return (
    <div className="title-screen" onClick={onStart}>
      <h1>PR-mon GO</h1>
      <div className="subtitle">Gotta Merge &apos;Em All!</div>
      <div style={{ fontSize: 48, margin: '20px 0' }}>{'\u{1f47e}'}</div>
      <div className="blink-text">PRESS START</div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('title');
  const [selectedPrmon, setSelectedPrmon] = useState(null);
  const {
    battle,
    loading,
    animating,
    lastHit,
    turnMessages,
    startBattle,
    attack,
    catchPrmon,
    runAway,
    clearBattle,
  } = useBattle();

  function handleStart() {
    setScreen('list');
  }

  async function handleSelectPrmon(prmon) {
    setSelectedPrmon(prmon);
    await startBattle(prmon.id);
    setScreen('battle');
  }

  function handleAttack(moveId) {
    attack(moveId);
  }

  function handleRun() {
    runAway();
    clearBattle();
    setScreen('list');
  }

  function handleCatch() {
    catchPrmon();
  }

  function handleRetry() {
    if (selectedPrmon) {
      clearBattle();
      handleSelectPrmon(selectedPrmon);
    }
  }

  function handleBackToList() {
    clearBattle();
    setSelectedPrmon(null);
    setScreen('list');
  }

  // Determine which screen to show based on battle state
  let currentScreen = screen;
  if (battle) {
    if (battle.status === 'won' || battle.status === 'caught') currentScreen = 'victory';
    else if (battle.status === 'lost') currentScreen = 'defeat';
    else if (battle.status === 'fled') currentScreen = 'list';
    else currentScreen = 'battle';
  }

  return (
    <div className="gameboy-shell">
      <div className="screen-bezel">
        <div className="game-screen">
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
              onBack={handleBackToList}
              loading={loading}
            />
          )}

          {currentScreen === 'defeat' && battle && (
            <DefeatScreen
              battle={battle}
              onRetry={handleRetry}
              onBack={handleBackToList}
            />
          )}
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
