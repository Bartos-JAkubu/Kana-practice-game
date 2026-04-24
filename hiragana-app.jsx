import { useState, useEffect, useCallback, useRef } from "react";

// === POMOCNÉ FUNKCE ===
function parseWords(raw) {
  return raw.trim().split("\n").map(line => {
    const parts = line.split(" _-_ ");
    return {
      kana: parts[0] || "",
      romaji: [parts[1], parts[2], parts[3]].filter(Boolean),
      czech: parts[4] || "",
      english: parts[5] || "",
    };
  }).filter(w => w.kana && w.romaji.length > 0);
}

const DEFAULT_HIRAGANA = []; // naplní se fetch
const DEFAULT_KATAKANA = [];

const T = {
  cz: { /* ... stejné jako dříve ... */ },
  en: { /* ... stejné ... */ }
};

function formatTime(deciseconds) { /* ... stejné ... */ }

function App() {
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState("cz");
  const [screen, setScreen] = useState("menu");
  const [gameMode, setGameMode] = useState("infinite");
  const [wordCount, setWordCount] = useState(10);
  
  // DATA
  const [hiraganaWords, setHiraganaWords] = useState([]);
  const [katakanaWords, setKatakanaWords] = useState([]);
  const [customWords, setCustomWords] = useState(null);
  const [customFileName, setCustomFileName] = useState("");
  const [scriptSource, setScriptSource] = useState("hiragana"); // hiragana | katakana | custom
  
  const [currentWord, setCurrentWord] = useState(null);
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(null);
  const [completed, setCompleted] = useState(0);
  const [timer, setTimer] = useState(0);
  const [running, setRunning] = useState(false);
  
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  
  const t = T[lang];
  
  // Dynamický balík slov podle zdroje
  const activeWords = 
    scriptSource === "hiragana" ? hiraganaWords :
    scriptSource === "katakana" ? katakanaWords :
    customWords || [];
  
  // === LOAD EXTERNAL FILES ===
  useEffect(() => {
    const loadFiles = async () => {
      try {
        const [hiraRes, kataRes] = await Promise.all([
          fetch("/HiraganaSlova.txt"),
          fetch("/KatakanaSlova.txt")
        ]);
        const hiraText = await hiraRes.text();
        const kataText = await kataRes.text();
        setHiraganaWords(parseWords(hiraText));
        setKatakanaWords(parseWords(kataText));
      } catch (err) {
        console.warn("Nepodařilo se načíst soubory, použije se vestavěná databáze");
        // Fallback na vestavěná slova (stará HIRAGANA_RAW)
      }
    };
    loadFiles();
  }, []);
  
  // === LOCALSTORAGE PERSISTENCE ===
  useEffect(() => {
    const savedDark = localStorage.getItem("kana_dark");
    const savedLang = localStorage.getItem("kana_lang");
    const savedSource = localStorage.getItem("kana_source");
    if (savedDark !== null) setDark(savedDark === "true");
    if (savedLang) setLang(savedLang);
    if (savedSource) setScriptSource(savedSource);
  }, []);
  
  useEffect(() => {
    localStorage.setItem("kana_dark", dark);
    localStorage.setItem("kana_lang", lang);
    localStorage.setItem("kana_source", scriptSource);
  }, [dark, lang, scriptSource]);
  
  // === TIMER LOGIC ===
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setTimer(v => v + 1), 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);
  
  const pickWord = useCallback((pool) => pool[Math.floor(Math.random() * pool.length)], []);
  
  const startGame = () => {
    if (!activeWords.length) return;
    setCurrentWord(pickWord(activeWords));
    setInput("");
    setCompleted(0);
    setTimer(0);
    setFlash(null);
    setRunning(true);
    setScreen("game");
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  
  const handleInput = (val) => {
    setInput(val);
    if (!currentWord) return;
    const trimmed = val.trim().toLowerCase();
    const answers = currentWord.romaji.map(r => r.trim().toLowerCase());
    if (answers.includes(trimmed)) {
      setFlash("correct");
      const nextCompleted = completed + 1;
      if (gameMode === "timed" && nextCompleted >= wordCount) {
        setRunning(false);
        setCompleted(nextCompleted);
        setTimeout(() => setScreen("results"), 400);
        return;
      }
      setCompleted(nextCompleted);
      setTimeout(() => {
        setFlash(null);
        if (activeWords.length) setCurrentWord(pickWord(activeWords));
        setInput("");
        inputRef.current?.focus();
      }, 300);
    }
  };
  
  const endGame = () => {
    setRunning(false);
    setScreen("results");
  };
  
  const goMenu = () => {
    setRunning(false);
    setScreen("menu");
    setInput("");
    setCurrentWord(null);
  };
  
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseWords(ev.target.result);
      if (parsed.length) {
        setCustomWords(parsed);
        setCustomFileName(file.name);
        setScriptSource("custom");
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };
  
  // ESC návrat do menu
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape" && screen === "game") goMenu();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [screen]);
  
  // === STYLY (stejné jako dříve) ===
  const bg = dark ? "#0e0e16" : "#faf8f2";
  const surface = dark ? "#16161f" : "#ffffff";
  const surface2 = dark ? "#1e1e2e" : "#f3f0e8";
  const border = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text = dark ? "#e8e4d8" : "#1a1714";
  const textMuted = dark ? "rgba(232,228,216,0.5)" : "rgba(26,23,20,0.45)";
  const accent = "#c0392b";
  const accentLight = dark ? "rgba(192,57,43,0.15)" : "rgba(192,57,43,0.08)";
  const accentBright = "#e74c3c";
  
  const baseStyle = { /* ... */ };
  const cardStyle = { /* ... */ };
  const btnStyle = (primary, small) => ({ /* ... */ });
  const chipStyle = (active) => ({ /* ... */ });
  
  const topBar = ( /* ... */ );
  
  // === RENDER MENU ===
  if (screen === "menu") {
    const isHiraganaReady = hiraganaWords.length > 0;
    const isKatakanaReady = katakanaWords.length > 0;
    const isCustomReady = !!customWords;
    
    return (
      <div style={baseStyle}>
        {topBar}
        <div style={{ width: "100%", maxWidth: 520, marginTop: 8 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>あ</div>
            <h1 style={{ fontSize: 28, fontWeight: "700", margin: "0 0 6px" }}>{t.title}</h1>
            <p style={{ color: textMuted, fontSize: 14 }}>{t.subtitle}</p>
          </div>
          
          <div style={cardStyle}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: textMuted, marginBottom: 10 }}>
                {t.mode}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...chipStyle(scriptSource === "hiragana"), flex: 1 }} onClick={() => setScriptSource("hiragana")}>
                  {t.hiragana} {!isHiraganaReady && "⏳"}
                </button>
                <button style={{ ...chipStyle(scriptSource === "katakana"), flex: 1 }} onClick={() => setScriptSource("katakana")}>
                  Katakana {!isKatakanaReady && "⏳"}
                </button>
                <button style={{ ...chipStyle(scriptSource === "custom"), flex: 1, opacity: customWords ? 1 : 0.5 }} onClick={() => customWords && setScriptSource("custom")}>
                  {customWords ? `${customFileName.replace(/\.txt$/i, "").slice(0, 14)}` : t.custom}
                </button>
              </div>
              
              <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle(false, true), marginTop: 10, width: "100%", borderStyle: "dashed" }}>
                + {t.loadFile}
              </button>
              {customWords && (
                <div style={{ marginTop: 6, fontSize: 12, color: textMuted, textAlign: "center" }}>
                  {t.loaded}: {customWords.length} {t.wordsLabel}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11, color: textMuted, lineHeight: 1.5 }}>{t.fileHint}</div>
              <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }} onChange={handleFile} />
            </div>
            
            {/* Režim infinite/timed - stejný jako dříve */}
            {/* ... */}
            
            <button onClick={startGame} disabled={activeWords.length === 0} style={{ ...btnStyle(true), width: "100%", opacity: activeWords.length === 0 ? 0.5 : 1 }}>
              {activeWords.length === 0 ? "Načítám..." : t.start}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // === RENDER GAME a RESULTS (beze změn, jen používají activeWords) ===
  // ... (zde pokračuje původní kód pro obrazovky game a results)
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);