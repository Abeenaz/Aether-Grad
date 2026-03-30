import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, Shield, Zap, Trophy, BookOpen, RefreshCw, AlertCircle, ChevronRight, Sword, Sparkles, User, Settings } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const RANKS = [
  "Novice Scribe",
  "Aether Scholar",
  "Void Researcher",
  "Time Manipulator",
  "Aether Grandmaster"
];

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

interface Goal {
  id: string;
  text: string;
  completed: boolean;
  difficulty: 'mob' | 'elite' | 'boss';
}

export default function App() {
  const [time, setTime] = useState(50 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'sprint' | 'rest' | 'boss'>('sprint');
  const [mana, setMana] = useState(100);
  const [aura, setAura] = useState(0);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoal, setNewGoal] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<Goal['difficulty']>('mob');
  const [architectMessage, setArchitectMessage] = useState("The void awaits your command, Scribe. Align your intent with the Chronos Shield.");
  const [isGenerating, setIsGenerating] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const generateArchitectAdvice = useCallback(async (context: string) => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Current State: ${context}. Level: ${level}. Rank: ${RANKS[Math.floor((level - 1) / 5)] || RANKS[RANKS.length - 1]}. Provide a briefing and tactical analysis.`,
        config: {
          systemInstruction: ARCHITECT_SYSTEM_PROMPT,
          temperature: 0.7,
        },
      });
      setArchitectMessage(response.text || "The aether remains silent. Focus on your discipline.");
    } catch (error) {
      console.error("Architect failed to speak:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [level]);

  useEffect(() => {
    if (isActive && time > 0) {
      timerRef.current = setInterval(() => {
        setTime((prev) => prev - 1);
        if (mode === 'sprint' || mode === 'boss') {
          setMana((prev) => Math.max(0, prev - (mode === 'boss' ? 0.06 : 0.033)));
        } else if (mode === 'rest') {
          setMana((prev) => Math.min(100, prev + 0.1));
        }
      }, 1000);
    } else if (time === 0) {
      handleTimerComplete();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, time, mode]);

  const handleTimerComplete = () => {
    setIsActive(false);
    if (mode === 'sprint' || mode === 'boss') {
      const xpGain = mode === 'boss' ? 100 : 50;
      addXp(xpGain);
      setAura((prev) => Math.min(100, prev + (mode === 'boss' ? 30 : 15)));
      setMode('rest');
      setTime(10 * 60);
      generateArchitectAdvice(`Victory achieved in ${mode} mode. Restoration cycle initiated.`);
    } else {
      setMode('sprint');
      setTime(50 * 60);
      generateArchitectAdvice("Restoration complete. Mana pool stabilized. Choose your next encounter.");
    }
  };

  const addXp = (amount: number) => {
    setXp((prev) => {
      const newXp = prev + amount;
      const xpToLevel = level * 200;
      if (newXp >= xpToLevel) {
        setLevel((l) => l + 1);
        return newXp - xpToLevel;
      }
      return newXp;
    });
  };

  const toggleTimer = () => {
    if (!isActive) {
      generateArchitectAdvice(`Engaging ${mode} protocol. Maintain your aura.`);
    }
    setIsActive(!isActive);
  };

  const addGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;
    setGoals([...goals, { id: Date.now().toString(), text: newGoal, completed: false, difficulty: newDifficulty }]);
    setNewGoal("");
  };

  const toggleGoal = (id: string) => {
    setGoals(goals.map(g => {
      if (g.id === id) {
        const completed = !g.completed;
        if (completed) {
          const xpGains = { mob: 20, elite: 50, boss: 150 };
          addXp(xpGains[g.difficulty]);
          setAura(prev => Math.min(100, prev + (g.difficulty === 'boss' ? 10 : 5)));
        }
        return { ...g, completed };
      }
      return g;
    }));
  };

  const rank = RANKS[Math.floor((level - 1) / 5)] || RANKS[RANKS.length - 1];

  return (
    <div className="max-w-6xl mx-auto p-8 h-screen flex flex-col gap-8">
      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <h1 className="text-5xl font-serif tracking-tighter glow-text">AetherGrad</h1>
            <div className="px-3 py-1 glass-card rounded-full text-[10px] font-mono uppercase tracking-widest text-aether-accent border-aether-accent/30">
              v2.0.4
            </div>
          </motion.div>
          <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.3em] pl-1">{rank} • Level {level}</p>
        </div>

        <div className="flex gap-12 items-center">
          <div className="flex flex-col gap-4">
            <div className="w-48">
              <div className="flex justify-between text-[9px] uppercase font-mono mb-1.5 text-aether-mana/70 tracking-widest">
                <span>Mana Pool</span>
                <span>{Math.round(mana)}%</span>
              </div>
              <div className="mana-track">
                <div className="mana-glow bg-aether-mana" />
                <motion.div 
                  className="h-full bg-aether-mana relative z-10" 
                  animate={{ width: `${mana}%` }}
                  transition={{ type: 'spring', bounce: 0 }}
                />
              </div>
            </div>
            <div className="w-48">
              <div className="flex justify-between text-[9px] uppercase font-mono mb-1.5 text-aether-aura/70 tracking-widest">
                <span>Discipline Aura</span>
                <span>{Math.round(aura)}%</span>
              </div>
              <div className="mana-track">
                <div className="mana-glow bg-aether-aura" />
                <motion.div 
                  className="h-full bg-aether-aura relative z-10" 
                  animate={{ width: `${aura}%` }}
                  transition={{ type: 'spring', bounce: 0 }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 glass-card rounded-full flex items-center justify-center text-aether-accent border-aether-accent/20">
              <User size={20} />
            </div>
            <span className="text-[8px] font-mono opacity-30 uppercase">Profile</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
        {/* Left: Architect & Quests */}
        <div className="col-span-4 flex flex-col gap-8 min-h-0">
          <div className="glass-card p-8 flex flex-col gap-6 relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-1000">
              <Shield size={240} />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-gray-500 flex items-center gap-2">
                <Sparkles size={12} className="text-aether-accent" /> Chronos Oracle
              </h2>
              <div className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse" />
            </div>
            <div className="architect-box flex-1 relative z-10">
              <AnimatePresence mode="wait">
                <motion.p
                  key={architectMessage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="min-h-[120px]"
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
                    className="w-1.5 h-1.5 bg-aether-accent/40 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-8 flex flex-col flex-1 min-h-0">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-gray-500 mb-6 flex items-center gap-2">
              <Sword size={12} className="text-aether-accent" /> Active Quests
            </h2>
            
            <form onSubmit={addGoal} className="flex flex-col gap-4 mb-8">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  placeholder="Inscribe new quest..."
                  className="bg-transparent border-b border-white/10 flex-1 py-2 text-sm focus:outline-none focus:border-aether-accent transition-colors font-serif italic"
                />
                <button type="submit" className="w-10 h-10 glass-card rounded-xl flex items-center justify-center hover:text-aether-accent transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="flex gap-2">
                {(['mob', 'elite', 'boss'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewDifficulty(d)}
                    className={`px-3 py-1 rounded-full text-[8px] font-mono uppercase tracking-widest border transition-all ${newDifficulty === d ? 'border-aether-accent text-aether-accent bg-aether-accent/5' : 'border-white/5 text-gray-600 hover:border-white/20'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-4 custom-scrollbar">
              {goals.map((goal) => (
                <motion.div 
                  key={goal.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`quest-item group cursor-pointer ${goal.completed ? 'opacity-30 grayscale' : ''}`}
                  onClick={() => toggleGoal(goal.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${goal.completed ? 'bg-aether-accent border-aether-accent' : 'border-white/10 group-hover:border-aether-accent/50'}`}>
                      {goal.completed && <Trophy size={12} className="text-black" />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-serif ${goal.completed ? 'line-through' : 'text-gray-200'}`}>{goal.text}</p>
                      <span className="text-[8px] font-mono uppercase tracking-tighter opacity-40">{goal.difficulty} encounter</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              {goals.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-10 italic text-sm py-20">
                  The quest log is empty.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Timer & Focus */}
        <div className="col-span-8 flex flex-col gap-8">
          <div className="glass-card flex-1 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Decorative Circles */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
              <div className="w-[500px] h-[500px] border border-white rounded-full animate-pulse" />
              <div className="absolute w-[400px] h-[400px] border border-white rounded-full" />
              <div className="absolute w-[300px] h-[300px] border border-white rounded-full animate-reverse-spin" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-12">
              <div className="text-center">
                <motion.div 
                  key={mode}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-mono text-[10px] uppercase tracking-[0.8em] text-aether-accent mb-6"
                >
                  {mode === 'boss' ? 'Boss Encounter' : mode === 'sprint' ? 'Chronos Shield' : 'Restoration'}
                </motion.div>
                <div className="timer-text floating">
                  {Math.floor(time / 60).toString().padStart(2, '0')}
                  <span className="opacity-20 mx-1">:</span>
                  {(time % 60).toString().padStart(2, '0')}
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div className="flex flex-col items-center gap-2">
                  <button 
                    onClick={() => {
                      setMode(mode === 'sprint' ? 'boss' : 'sprint');
                      setTime(50 * 60);
                    }}
                    className={`w-12 h-12 glass-card rounded-2xl flex items-center justify-center transition-all ${mode === 'boss' ? 'text-red-500 border-red-500/30' : 'text-gray-600'}`}
                  >
                    <Sword size={20} />
                  </button>
                  <span className="text-[8px] font-mono uppercase opacity-30">Intensity</span>
                </div>

                <button 
                  onClick={toggleTimer}
                  className="w-32 h-32 glass-card rounded-full flex items-center justify-center relative group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/5 scale-0 group-hover:scale-100 transition-transform duration-700 rounded-full" />
                  <AnimatePresence mode="wait">
                    {isActive ? (
                      <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <RefreshCw size={40} className="animate-spin-slow" />
                      </motion.div>
                    ) : (
                      <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Zap size={40} className="group-hover:text-aether-accent transition-colors" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>

                <div className="flex flex-col items-center gap-2">
                  <button 
                    onClick={() => {
                      setIsActive(false);
                      setTime(mode === 'rest' ? 50 * 60 : 10 * 60);
                      setMode(mode === 'rest' ? 'sprint' : 'rest');
                    }}
                    className="w-12 h-12 glass-card rounded-2xl flex items-center justify-center text-gray-600 hover:text-blue-400 transition-colors"
                  >
                    <RefreshCw size={20} />
                  </button>
                  <span className="text-[8px] font-mono uppercase opacity-30">Cycle</span>
                </div>
              </div>
            </div>

            {/* XP Bar at bottom of timer */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
              <motion.div 
                className="h-full bg-gradient-to-r from-aether-accent to-orange-400"
                animate={{ width: `${(xp / (level * 200)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status */}
      <div className="flex justify-between items-center px-2">
        <div className="flex gap-8 items-center">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full bg-aether-accent shadow-[0_0_8px_#ff4e00]" />
            Aether Stream Connected
          </div>
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-gray-600">
            <Shield size={10} />
            Protocol 50/10 Engaged
          </div>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.5em] text-gray-700">
          Chronos Architect v2.0.4 • System Stable
        </div>
      </div>
    </div>
  );
}
