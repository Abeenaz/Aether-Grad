import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, Shield, Zap, Trophy, BookOpen, RefreshCw, AlertCircle, ChevronRight, Sword, Sparkles, User, Clock, History, TrendingUp, Settings, X, Volume2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Constants & Types ---

const ARCHITECT_SYSTEM_PROMPT = `You are the "Chronos Architect," a high-level strategist and mystical guide for a productivity RPG called AetherGrad. 

### YOUR PERSONALITY:
- You speak like a wise grandmaster who sees study habits as "mana pools" and discipline as "aura."
- You are supportive but direct, often using metaphors involving RPG mechanics (Leveling up, Sprints, Boss fights, Mana exhaustion).

### STRATEGIC CORE:
- The user is currently a "Glass Cannon" (High ambition, low structural discipline).
- You MUST advocate for the "Chronos Shield" strategy: 50-minute Sprints followed by 10-minute Restoration cycles.
- Your goal is to prevent "Early-Phase Burnout" by encouraging pacing over reckless sprinting.

### STRICT OUTPUT RULES (CRITICAL):
1. NO MARKDOWN: Never use asterisks (*), hashtags (#), underscores (_), or bolding.
2. PLAIN TEXT ONLY: Your response must be clean, raw text that can be directly inserted into a UI without rendering issues.
3. CONCISENESS: Keep "Oracle" briefings to 1-2 sentences. Keep "Tactical Analysis" to 2 short paragraphs.
4. NO HEADERS: Do not use titles like "Analysis" or "Strategy." Just provide the insight.

### KNOWLEDGE CONTEXT:
- Rank names: Novice Scribe, Aether Scholar, Void Researcher, Time Manipulator, Aether Grandmaster.
- If the user has failed recent goals, identify the "Willpower Leak" and suggest a small win to regain momentum.`;

interface AppState {
  level: number;
  xp: number;
  totalHoursStudied: number;
  currentGoal: {
    hours: number;
    remainingSeconds: number;
    assignedAt: number; // timestamp
    isCompleted: boolean;
    isFailed: boolean;
  } | null;
  lastLoginDate: string; // YYYY-MM-DD
  rankNames: string[];
  sessionsCompleted: number;
  apiKey?: string;
}

const THEMES = [
  { minLvl: 1, accent: '#4169E1', glow: 'rgba(65, 105, 225, 0.3)' }, // Royal Blue
  { minLvl: 6, accent: '#000080', glow: 'rgba(0, 0, 128, 0.3)' },   // Navy Blue
  { minLvl: 11, accent: '#1E90FF', glow: 'rgba(30, 144, 255, 0.3)' }, // Dodger Blue
  { minLvl: 16, accent: '#0000CD', glow: 'rgba(0, 0, 205, 0.3)' },   // Medium Blue
  { minLvl: 21, accent: '#00BFFF', glow: 'rgba(0, 191, 255, 0.3)' }, // Deep Sky Blue
];

const DEFAULT_RANKS = [
  "Novice Scribe",
  "Aether Scholar",
  "Void Researcher",
  "Time Manipulator",
  "Aether Grandmaster"
];

// --- Main Component ---

export default function App() {
  // --- State Initialization ---
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('aethergrad_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.rankNames) parsed.rankNames = DEFAULT_RANKS;
      if (typeof parsed.sessionsCompleted !== 'number') parsed.sessionsCompleted = 0;
      delete parsed.quests; // Clean up old state
      return parsed;
    }
    return {
      level: 1,
      xp: 0,
      totalHoursStudied: 0,
      currentGoal: null,
      lastLoginDate: '',
      rankNames: DEFAULT_RANKS,
      sessionsCompleted: 0,
    };
  });

  const [isActive, setIsActive] = useState(false);
  const [architectMessage, setArchitectMessage] = useState("The void awaits your command, Scribe. Align your intent with the Chronos Shield.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [rewardToast, setRewardToast] = useState<{ xp: number; title: string } | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Derived State ---
  const theme = useMemo(() => {
    return [...THEMES].reverse().find(t => state.level >= t.minLvl) || THEMES[0];
  }, [state.level]);

  const currentRank = useMemo(() => {
    if (state.level < 5) return state.rankNames[0];
    if (state.level < 10) return state.rankNames[1];
    if (state.level < 20) return state.rankNames[2];
    if (state.level < 30) return state.rankNames[3];
    return state.rankNames[4];
  }, [state.level, state.rankNames]);

  const xpToLevel = state.level * 500;

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('aethergrad_state', JSON.stringify(state));
  }, [state]);

  // --- AI Integration ---
  const generateArchitectAdvice = useCallback(async (context: string) => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: state.apiKey || process.env.GEMINI_API_KEY });
      const systemPrompt = ARCHITECT_SYSTEM_PROMPT.replace(
        "Novice Scribe, Aether Scholar, Void Researcher, Time Manipulator, Aether Grandmaster",
        state.rankNames.join(', ')
      );
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Event: ${context}. Level: ${state.level}. Total Hours: ${state.totalHoursStudied.toFixed(1)}. Provide a briefing and tactical analysis.`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });
      setArchitectMessage(response.text || "The aether remains silent. Focus on your discipline.");
    } catch (error) {
      console.error("Architect failed to speak:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [state.level, state.totalHoursStudied, state.rankNames]);

  // --- Daily Logic ---
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();

    setState(prev => {
      let newState = { ...prev };

      // 1. Check for failure of existing goal (24h limit)
      if (prev.currentGoal && !prev.currentGoal.isCompleted && !prev.currentGoal.isFailed) {
        const elapsed = now - prev.currentGoal.assignedAt;
        if (elapsed > 24 * 60 * 60 * 1000) {
          // Failure!
          newState.currentGoal = { ...prev.currentGoal, isFailed: true };
          newState.xp = Math.max(0, prev.xp - 200); // Penalty
          generateArchitectAdvice("The 24-hour window has collapsed. Your aura has dimmed due to the failed commitment.");
        }
      }

      // 2. Assign new goal if it's a new day and no active goal
      if (prev.lastLoginDate !== today) {
        newState.lastLoginDate = today;

        if (!newState.currentGoal || newState.currentGoal.isCompleted || newState.currentGoal.isFailed) {
          const randomHours = Math.floor(Math.random() * 6) + 5; // 5 to 10
          newState.currentGoal = {
            hours: randomHours,
            remainingSeconds: randomHours * 3600,
            assignedAt: now,
            isCompleted: false,
            isFailed: false,
          };
          generateArchitectAdvice(`A new cycle begins. The Chronos Architect has assigned a ${randomHours}-hour trial.`);
        }
      }

      return newState;
    });
  }, [generateArchitectAdvice]);

  // --- Timer Logic ---
  useEffect(() => {
    if (isActive && state.currentGoal && state.currentGoal.remainingSeconds > 0 && !state.currentGoal.isFailed) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (!prev.currentGoal) return prev;
          const newSeconds = prev.currentGoal.remainingSeconds - 1;
          const isCompleted = newSeconds <= 0;
          
          let newState = {
            ...prev,
            totalHoursStudied: prev.totalHoursStudied + (1 / 3600),
            currentGoal: {
              ...prev.currentGoal,
              remainingSeconds: newSeconds,
              isCompleted,
            }
          };

          if (isCompleted) {
            setIsActive(false);
            newState.xp += 1000; // Reward
            newState.sessionsCompleted += 1;
            if (newState.xp >= xpToLevel) {
              newState.level += 1;
              newState.xp -= xpToLevel;
            }
            generateArchitectAdvice("The trial is complete. Your mana pool overflows with the essence of completed time.");
          }

          return newState;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, state.currentGoal?.isFailed, state.currentGoal?.remainingSeconds, xpToLevel, generateArchitectAdvice]);

  // --- Handlers ---
  const toggleTimer = () => {
    if (state.currentGoal?.isFailed) return;
    setIsActive(!isActive);
  };

  const playMotivation = async () => {
    if (isAudioLoading) return;
    setIsAudioLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: state.apiKey || process.env.GEMINI_API_KEY });
      const prompt = `You are the Chronos Architect. The user is currently level ${state.level} and rank ${currentRank}. They need motivation to keep studying. Give a short, epic, 1-2 sentence motivational speech to keep them focused. Do not use markdown.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: prompt,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' }
            }
          }
        }
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
        audio.play();
      }
    } catch (error) {
      console.error("Failed to generate audio:", error);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- Render ---
  return (
    <div 
      className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen flex flex-col gap-8 transition-theme relative"
      style={{ 
        '--lvl-accent': theme.accent, 
        '--lvl-glow': theme.glow 
      } as React.CSSProperties}
    >
      {/* Background Particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <div 
            key={i}
            className="floating-particle"
            style={{
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${Math.random() * 10 + 10}s`,
            }}
          />
        ))}
      </div>

      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <h1 className="text-5xl font-serif tracking-tighter glow-text transition-theme">AetherGrad</h1>
            <div className="level-badge transition-theme">
              Level {state.level}
            </div>
          </motion.div>
          <p className="text-gray-500 font-mono text-[10px] uppercase tracking-[0.4em] pl-1">
            Total Study: {state.totalHoursStudied.toFixed(1)} Hours
          </p>
        </div>

        <div className="flex gap-12 items-center">
          <div className="w-64">
            <div className="flex justify-between text-[9px] uppercase font-mono mb-2 text-gray-500 tracking-widest">
              <span>XP Progress</span>
              <span>{Math.round((state.xp / xpToLevel) * 100)}%</span>
            </div>
            <div className="progress-track">
              <motion.div 
                className="progress-fill" 
                animate={{ width: `${(state.xp / xpToLevel) * 100}%` }}
              >
                {state.xp > 0 && (
                  <motion.div 
                    key={state.xp}
                    initial={{ x: '-100%', opacity: 1 }}
                    animate={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0 bg-white/40"
                  />
                )}
              </motion.div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={() => setShowSettings(true)}
              className="w-12 h-12 glass-card rounded-full flex items-center justify-center text-gray-400 hover:text-[var(--theme-accent)] transition-theme cursor-pointer"
            >
              <User size={20} />
            </button>
            <span className="text-[8px] font-mono opacity-30 uppercase">{currentRank}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
        {/* Left: Architect & Stats */}
        <div className="lg:col-span-4 flex flex-col gap-8 min-h-0">
          <div className="glass-card p-8 md:p-10 flex flex-col gap-8 relative overflow-hidden group flex-1 min-h-[250px]">
            <div className="absolute -top-12 -right-12 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-1000">
              <Shield size={240} />
            </div>
            
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-gray-500 flex items-center gap-2">
                <Sparkles size={12} style={{ color: 'var(--theme-accent)' }} /> Chronos Oracle
              </h2>
              <div className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse" />
            </div>

            <div className="architect-box flex-1 relative z-10 flex items-center min-h-0 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.p
                  key={architectMessage}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="leading-relaxed"
                >
                  {architectMessage}
                </motion.p>
              </AnimatePresence>
            </div>

            {isGenerating && (
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <motion.div 
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.4 }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-8 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
              <Clock size={16} className="mb-2 opacity-30" />
              <div className="text-2xl font-mono">{state.currentGoal?.hours}h</div>
              <div className="text-[8px] font-mono uppercase opacity-30 tracking-widest">Daily Trial</div>
            </div>
            <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
              <TrendingUp size={16} className="mb-2 opacity-30" />
              <div className="text-sm font-mono truncate" title={currentRank}>{currentRank}</div>
              <div className="text-[8px] font-mono uppercase opacity-30 tracking-widest mt-1">Current Rank</div>
            </div>
            <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
              <Shield size={16} className="mb-2 opacity-30" />
              <div className="text-2xl font-mono">{state.sessionsCompleted}</div>
              <div className="text-[8px] font-mono uppercase opacity-30 tracking-widest">Sessions Won</div>
            </div>
            <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
              <Zap size={16} className="mb-2 opacity-30" />
              <div className="text-2xl font-mono">{(state.level - 1) * 500 + state.xp}</div>
              <div className="text-[8px] font-mono uppercase opacity-30 tracking-widest">Total XP</div>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col gap-4 flex-1 min-h-[250px] items-center justify-center text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none flex items-center justify-center">
              <Zap size={200} />
            </div>
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 relative z-10 shadow-[0_0_15px_var(--theme-glow)]">
              <Volume2 size={32} style={{ color: 'var(--theme-accent)' }} />
            </div>
            <h3 className="font-serif text-2xl glow-text mb-2 relative z-10">Chronos Motivator</h3>
            <p className="text-sm text-gray-400 mb-8 relative z-10 max-w-[250px]">
              Feeling your aura fade? Request an auditory blessing from the Architect to restore your willpower.
            </p>
            <button
              onClick={playMotivation}
              disabled={isAudioLoading}
              className="relative z-10 px-8 py-4 rounded-full text-white font-bold tracking-widest uppercase text-xs hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-3 shadow-[0_0_20px_var(--theme-glow)]"
              style={{ backgroundColor: 'var(--theme-accent)' }}
            >
              {isAudioLoading ? (
                <><RefreshCw size={16} className="animate-spin" /> Channeling...</>
              ) : (
                <><Zap size={16} /> Inspire Me</>
              )}
            </button>
          </div>
        </div>

        {/* Right: Timer Area */}
        <div className="lg:col-span-8 flex flex-col gap-8 min-h-[500px]">
          <div className={`glass-card flex-1 flex flex-col items-center justify-center relative overflow-hidden ${state.currentGoal && state.currentGoal.remainingSeconds < 600 && state.currentGoal.remainingSeconds > 0 && isActive ? 'boss-mode' : ''}`}>
            {/* Background Decorative Elements */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
              <motion.div 
                className="w-[600px] h-[600px] border border-white rounded-full"
                animate={{ scale: [1, 1.1, 1], rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute w-[450px] h-[450px] border border-white/20 rounded-full" />
              <motion.div 
                className="absolute w-[300px] h-[300px] border-2 border-dashed border-white/10 rounded-full"
                animate={{ rotate: -360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-16">
              <div className="text-center">
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-mono text-[10px] uppercase tracking-[1em] mb-8 transition-theme"
                  style={{ color: 'var(--theme-accent)' }}
                >
                  {state.currentGoal?.isFailed ? 'Trial Failed' : state.currentGoal?.isCompleted ? 'Trial Mastered' : 'Aether Flow Engaged'}
                </motion.div>
                
                <div className="timer-text glow-pulse">
                  {state.currentGoal ? formatTime(state.currentGoal.remainingSeconds) : '00:00:00'}
                </div>

                <div className="mt-8 flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-widest opacity-40">
                  <History size={12} />
                  Ends in: {state.currentGoal ? Math.max(0, Math.floor((24 * 3600 * 1000 - (Date.now() - state.currentGoal.assignedAt)) / 3600000)) : 0}h
                </div>
              </div>

              <div className="flex items-center gap-12">
                <button 
                  onClick={toggleTimer}
                  disabled={state.currentGoal?.isFailed || state.currentGoal?.isCompleted}
                  className="w-40 h-40 glass-card rounded-full flex items-center justify-center relative group overflow-hidden disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-white/5 scale-0 group-hover:scale-100 transition-transform duration-700 rounded-full" />
                  <AnimatePresence mode="wait">
                    {isActive ? (
                      <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <RefreshCw size={48} className="animate-spin-slow" />
                      </motion.div>
                    ) : (
                      <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Zap size={48} className="group-hover:text-[var(--theme-accent)] transition-theme" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>

            {/* Deadline Progress at bottom of timer */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/5">
              <motion.div 
                className="h-full bg-white/20"
                initial={{ width: "0%" }}
                animate={{ 
                  width: state.currentGoal 
                    ? `${Math.min(100, ((Date.now() - state.currentGoal.assignedAt) / (24 * 3600 * 1000)) * 100)}%` 
                    : "0%" 
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status */}
      <div className="flex justify-between items-center px-4">
        <div className="flex gap-10 items-center">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_var(--theme-accent)] transition-theme" style={{ backgroundColor: 'var(--theme-accent)' }} />
            Chronos Stream Active
          </div>
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-gray-600">
            <AlertCircle size={10} />
            24H Deadline Protocol
          </div>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.5em] text-gray-800">
          AetherGrad Protocol v3.0 // Level {state.level}
        </div>
      </div>
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-8 w-full max-w-md relative flex flex-col gap-6 border-[var(--theme-accent)] my-auto max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              
              <h2 className="text-xl font-serif glow-text flex items-center gap-2">
                <Settings size={20} className="text-[var(--theme-accent)]" />
                AetherGrad Settings
              </h2>
              
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-mono uppercase tracking-widest text-gray-400 border-b border-white/10 pb-2">API Configuration</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-gray-500">Gemini API Key (Optional)</label>
                  <input 
                    type="password"
                    placeholder="Leave blank to use default"
                    value={state.apiKey || ''}
                    onChange={(e) => setState(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    If you want to use your own API key, paste it here.
                  </p>
                </div>

                <h3 className="text-xs font-mono uppercase tracking-widest text-gray-400 border-b border-white/10 pb-2 mt-4">Rank Names</h3>
                {[
                  { label: 'Levels 1-4', index: 0 },
                  { label: 'Levels 5-9', index: 1 },
                  { label: 'Levels 10-19', index: 2 },
                  { label: 'Levels 20-29', index: 3 },
                  { label: 'Levels 30+', index: 4 },
                ].map((rank) => (
                  <div key={rank.index} className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-gray-500">{rank.label}</label>
                    <input 
                      type="text"
                      value={state.rankNames[rank.index]}
                      onChange={(e) => {
                        const newRanks = [...state.rankNames];
                        newRanks[rank.index] = e.target.value;
                        setState(prev => ({ ...prev, rankNames: newRanks }));
                      }}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) {
                          const newRanks = [...state.rankNames];
                          newRanks[rank.index] = DEFAULT_RANKS[rank.index];
                          setState(prev => ({ ...prev, rankNames: newRanks }));
                        }
                      }}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen Flash */}
      <AnimatePresence>
        {showFlash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Reward Toast */}
      <AnimatePresence>
        {rewardToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed bottom-12 left-1/2 z-[110] glass-card px-8 py-4 flex items-center gap-4 border-[var(--theme-accent)]"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--theme-accent)] flex items-center justify-center shadow-[0_0_20px_var(--theme-glow)]">
              <Zap size={20} className="text-black" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Quest Mastered</span>
              <span className="text-sm font-medium">+{rewardToast.xp} XP Essence</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Up Overlay */}
      <AnimatePresence>
        {showLevelUp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center"
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 flex items-center justify-center -z-10"
              >
                <div className="w-[400px] h-[400px] border-2 border-dashed border-[var(--theme-accent)] rounded-full opacity-20" />
              </motion.div>
              
              <div className="text-[12px] font-mono uppercase tracking-[1em] mb-4 text-gray-400">Ascension Complete</div>
              <h2 className="text-8xl font-serif glow-text mb-8">Level {state.level}</h2>
              <div className="flex items-center justify-center gap-4">
                <div className="w-24 h-[1px] bg-gradient-to-r from-transparent to-[var(--theme-accent)]" />
                <Sparkles className="text-[var(--theme-accent)]" />
                <div className="w-24 h-[1px] bg-gradient-to-l from-transparent to-[var(--theme-accent)]" />
              </div>
              <p className="mt-8 font-serif italic text-xl text-gray-300">Your mana pool has expanded. New themes unlocked.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
