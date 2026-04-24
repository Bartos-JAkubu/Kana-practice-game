// ===================== FIREBASE INICIALIZACE =====================
const firebaseConfig = {
  /* TVOJE FIREBASE CONFIG - vlož sem celý objekt z Firebase */
  apiKey: "AIzaSyCPkNylYTdAVONjLorMq7qB9TIsuAC2u84",
  authDomain: "kana-practice-game.firebaseapp.com",
  projectId: "kana-practice-game",
  // ...
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===================== POMOCNÉ FUNKCE =====================
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

function formatTime(deciseconds) {
  const totalSeconds = deciseconds / 10;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor(deciseconds % 10);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

function parseTimeToDeciseconds(timeStr) { // "01:23.4" -> 834
  const [mmss, tenth] = timeStr.split('.');
  const [mm, ss] = mmss.split(':');
  return (parseInt(mm) * 60 + parseInt(ss)) * 10 + parseInt(tenth);
}

// Zvukové efekty (soubory vložte do /sounds/)
function playSound(name) {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.volume = 0.5;
  audio.play().catch(e => console.log("Zvuk nelze přehrát", e));
}

// ===================== HLAVNÍ KOMPONENTA =====================
const { useState, useEffect, useCallback, useRef } = React;

function App() {
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState("cz");
  const [screen, setScreen] = useState("menu");
  const [gameMode, setGameMode] = useState("infinite"); // infinite | timed | competition50 | competition100
  const [wordCount, setWordCount] = useState(10);
  
  // Slovní zásoba
  const [hiraganaWords, setHiraganaWords] = useState([]);
  const [katakanaWords, setKatakanaWords] = useState([]);
  const [customWords, setCustomWords] = useState(null);
  const [customFileName, setCustomFileName] = useState("");
  const [scriptSource, setScriptSource] = useState("hiragana");
  
  // Herní stav
  const [currentWord, setCurrentWord] = useState(null);
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(null);
  const [completed, setCompleted] = useState(0);
  const [timer, setTimer] = useState(0);
  const [running, setRunning] = useState(false);
  
  // Uživatel a žebříčky
  const [user, setUser] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardMode, setLeaderboardMode] = useState("50"); // "50" nebo "100"
  const [leaderboardPeriod, setLeaderboardPeriod] = useState("all"); // day, week, month, all
  const [bestScores, setBestScores] = useState({ "50": null, "100": null });
  
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  
  const t = T[lang];
  
  // Dynamický balík slov
  const activeWords = scriptSource === "hiragana" ? hiraganaWords :
                      scriptSource === "katakana" ? katakanaWords :
                      customWords || [];
  
  // Načtení textových souborů
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
      } catch (err) { console.warn(err); }
    };
    loadFiles();
  }, []);
  
  // Načtení uložených nastavení
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
  
  // Autentizace Firebase
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        // Načtení nejlepších skóre uživatele
        const userScoresSnap = await db.collection("scores")
          .where("userId", "==", user.uid)
          .get();
        const best50 = { time: Infinity, docId: null };
        const best100 = { time: Infinity, docId: null };
        userScoresSnap.forEach(doc => {
          const data = doc.data();
          if (data.mode === "50" && data.time < best50.time) { best50.time = data.time; best50.docId = doc.id; }
          if (data.mode === "100" && data.time < best100.time) { best100.time = data.time; best100.docId = doc.id; }
        });
        setBestScores({
          "50": best50.time !== Infinity ? best50.time : null,
          "100": best100.time !== Infinity ? best100.time : null,
        });
      }
    });
    return () => unsubscribe();
  }, []);
  
  // Žebříček (dle módu a období)
  useEffect(() => {
    if (!db) return;
    let startDate = null;
    const now = new Date();
    if (leaderboardPeriod === "day") { startDate = new Date(now.setHours(0,0,0,0)); }
    else if (leaderboardPeriod === "week") { const d = new Date(); d.setDate(d.getDate() - d.getDay()); startDate = new Date(d.setHours(0,0,0,0)); }
    else if (leaderboardPeriod === "month") { startDate = new Date(now.getFullYear(), now.getMonth(), 1); }
    
    let query = db.collection("scores").where("mode", "==", leaderboardMode).orderBy("time", "asc").limit(20);
    if (startDate) query = query.where("timestamp", ">=", firebase.firestore.Timestamp.fromDate(startDate));
    
    query.get().then(snapshot => {
      const scores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(scores);
    }).catch(err => console.warn(err));
  }, [leaderboardMode, leaderboardPeriod]);
  
  // Timer logika
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setTimer(v => v + 1), 100);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [running]);
  
  const pickWord = useCallback((pool) => pool[Math.floor(Math.random() * pool.length)], []);
  
  // Uložení skóre do Firestore
  const saveScore = async (mode, timeDeciseconds) => {
    if (!user) return;
    // Zkontrolujeme, zda už nemáme lepší skóre
    const modeKey = mode === "50" ? "50" : "100";
    if (bestScores[modeKey] !== null && timeDeciseconds >= bestScores[modeKey]) return; // není lepší
    
    // Uložíme nový dokument
    await db.collection("scores").add({
      userId: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      mode: mode,
      time: timeDeciseconds,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Aktualizujeme lokální bestScores
    setBestScores(prev => ({ ...prev, [modeKey]: timeDeciseconds }));
    playSound("new-record");
  };
  
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
      playSound("correct");
      setFlash("correct");
      const nextCompleted = completed + 1;
      let target = 0;
      if (gameMode === "timed") target = wordCount;
      else if (gameMode === "competition50") target = 50;
      else if (gameMode === "competition100") target = 100;
      
      if (target > 0 && nextCompleted >= target) {
        setRunning(false);
        setCompleted(nextCompleted);
        const timeTaken = timer + 1; // poslední decisecond
        if (gameMode === "competition50") saveScore("50", timeTaken);
        else if (gameMode === "competition100") saveScore("100", timeTaken);
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
    } else {
      playSound("wrong");
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
  
  const signInWithGoogle = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(provider); }
    catch (err) { console.error(err); }
  };
  
  const signOut = () => auth.signOut();
  
  // ESC klávesa
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape" && screen === "game") goMenu(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [screen]);
  
  // Styly (stejné jako dříve, jen nepatrně upravené)
  const bg = dark ? "#0e0e16" : "#faf8f2";
  const surface = dark ? "#16161f" : "#ffffff";
  const surface2 = dark ? "#1e1e2e" : "#f3f0e8";
  const border = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text = dark ? "#e8e4d8" : "#1a1714";
  const textMuted = dark ? "rgba(232,228,216,0.5)" : "rgba(26,23,20,0.45)";
  const accent = "#c0392b";
  const accentLight = dark ? "rgba(192,57,43,0.15)" : "rgba(192,57,43,0.08)";
  const accentBright = "#e74c3c";
  
  const baseStyle = { minHeight: "100vh", background: bg, color: text, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 40px", transition: "background 0.2s, color 0.2s" };
  const cardStyle = { background: surface, border: `1px solid ${border}`, borderRadius: 16, padding: 24, boxShadow: dark ? "0 6px 20px rgba(0,0,0,0.4)" : "0 6px 20px rgba(0,0,0,0.05)" };
  const btnStyle = (primary, small) => ({ padding: small ? "8px 12px" : "12px 18px", borderRadius: 10, border: primary ? "none" : `1px solid ${border}`, background: primary ? accent : surface2, color: primary ? "#fff" : text, fontSize: small ? 13 : 15, fontWeight: 600, cursor: "pointer", transition: "transform 0.08s, background 0.15s, opacity 0.15s" });
  const chipStyle = (active) => ({ padding: "10px 14px", borderRadius: 10, border: `1px solid ${active ? accent : border}`, background: active ? accentLight : surface2, color: active ? accentBright : text, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" });
  
  const topBar = (
    <div style={{ width: "100%", maxWidth: 520, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setLang("cz")} style={chipStyle(lang === "cz")}>CZ</button>
        <button onClick={() => setLang("en")} style={chipStyle(lang === "en")}>EN</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={user.photoURL} style={{ width: 28, height: 28, borderRadius: "50%" }} />
            <button onClick={signOut} style={btnStyle(false, true)}>🚪</button>
          </div>
        ) : (
          <button onClick={signInWithGoogle} style={{ ...btnStyle(false, true), background: accent, color: "#fff", border: "none" }}>🔑 Google</button>
        )}
        <button onClick={() => setDark(v => !v)} style={btnStyle(false, true)}>{dark ? "☀︎" : "☾"}</button>
      </div>
    </div>
  );
  
  // =============== MENU ===============
  if (screen === "menu") {
    const isHiraganaReady = hiraganaWords.length > 0;
    const isKatakanaReady = katakanaWords.length > 0;
    
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
            {/* Zdroj slov */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: textMuted, marginBottom: 10 }}>{t.mode}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...chipStyle(scriptSource === "hiragana"), flex: 1 }} onClick={() => setScriptSource("hiragana")}>{t.hiragana} {!isHiraganaReady && "⏳"}</button>
                <button style={{ ...chipStyle(scriptSource === "katakana"), flex: 1 }} onClick={() => setScriptSource("katakana")}>Katakana {!isKatakanaReady && "⏳"}</button>
                <button style={{ ...chipStyle(scriptSource === "custom"), flex: 1, opacity: customWords ? 1 : 0.5 }} onClick={() => customWords && setScriptSource("custom")}>
                  {customWords ? `${customFileName.replace(/\.txt$/i, "").slice(0, 14)}` : t.custom}
                </button>
              </div>
              <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle(false, true), marginTop: 10, width: "100%", borderStyle: "dashed" }}>+ {t.loadFile}</button>
              {customWords && <div style={{ marginTop: 6, fontSize: 12, color: textMuted, textAlign: "center" }}>{t.loaded}: {customWords.length} {t.wordsLabel}</div>}
              <div style={{ marginTop: 6, fontSize: 11, color: textMuted, lineHeight: 1.5 }}>{t.fileHint}</div>
              <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }} onChange={handleFile} />
            </div>
            
            {/* Herní režimy */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: textMuted, marginBottom: 10 }}>{t.gameMode}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <button style={{ ...chipStyle(gameMode === "infinite"), flex: 1 }} onClick={() => setGameMode("infinite")}>∞ {t.infinite}</button>
                <button style={{ ...chipStyle(gameMode === "timed"), flex: 1 }} onClick={() => setGameMode("timed")}>⏱ {t.timed}</button>
                <button style={{ ...chipStyle(gameMode === "competition50"), flex: 1 }} onClick={() => setGameMode("competition50")}>🏆 50</button>
                <button style={{ ...chipStyle(gameMode === "competition100"), flex: 1 }} onClick={() => setGameMode("competition100")}>🏆 100</button>
              </div>
              {gameMode === "timed" && (
                <div>
                  <div style={{ fontSize: 12, color: textMuted, marginBottom: 6 }}>{t.wordCount}: <strong>{wordCount}</strong></div>
                  <input type="range" min="5" max="50" step="5" value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))} style={{ width: "100%", accentColor: accent }} />
                </div>
              )}
              {(gameMode === "competition50" || gameMode === "competition100") && !user && (
                <div style={{ marginTop: 10, fontSize: 12, background: accentLight, padding: 8, borderRadius: 8, textAlign: "center" }}>
                  🔐 Pro uložení skóre se přihlaste Google účtem.
                </div>
              )}
            </div>
            
            <button onClick={startGame} disabled={activeWords.length === 0} style={{ ...btnStyle(true), width: "100%", opacity: activeWords.length === 0 ? 0.5 : 1 }}>
              {activeWords.length === 0 ? "Načítám..." : t.start}
            </button>
          </div>
          
          {/* Žebříček */}
          {user && (
            <div style={{ ...cardStyle, marginTop: 24 }}>
              <h3 style={{ fontSize: 18, marginBottom: 12 }}>🏆 Žebříček</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <select value={leaderboardMode} onChange={e => setLeaderboardMode(e.target.value)} style={{ background: surface2, border: `1px solid ${border}`, padding: 6, borderRadius: 8, color: text }}>
                  <option value="50">50 slov</option>
                  <option value="100">100 slov</option>
                </select>
                <select value={leaderboardPeriod} onChange={e => setLeaderboardPeriod(e.target.value)} style={{ background: surface2, border: `1px solid ${border}`, padding: 6, borderRadius: 8, color: text }}>
                  <option value="day">Denní</option>
                  <option value="week">Týdenní</option>
                  <option value="month">Měsíční</option>
                  <option value="all">Celkový</option>
                </select>
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>
                ⏱ Nejlepší čas uživatele: {bestScores[leaderboardMode] ? formatTime(bestScores[leaderboardMode]) : "–"}
              </div>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: `1px solid ${border}` }}><th style={{ textAlign: "left", padding: "6px 0" }}>#</th><th>Uživatel</th><th>Čas</th></tr></thead>
                <tbody>
                  {leaderboard.map((entry, idx) => (
                    <tr key={entry.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: "6px 0" }}>{idx+1}.</td>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><img src={entry.photoURL} width={20} height={20} style={{ borderRadius: "50%" }} /> {entry.displayName}</div></td>
                      <td>{formatTime(entry.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leaderboard.length === 0 && <div style={{ textAlign: "center", padding: 16, color: textMuted }}>Zatím žádné skóre.</div>}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // =============== OBRAZOVKA HRY ===============
  if (screen === "game" && currentWord) {
    const target = gameMode === "competition50" ? 50 : gameMode === "competition100" ? 100 : (gameMode === "timed" ? wordCount : null);
    const progress = target ? (completed / target) * 100 : null;
    const flashColor = flash === "correct" ? "#2ecc71" : null;
    
    return (
      <div style={baseStyle}>
        <div style={{ width: "100%", maxWidth: 520, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={goMenu} style={btnStyle(false, true)}>← {t.backToMenu}</button>
          <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, color: textMuted }}>
            <span>⏱ {formatTime(timer)}</span>
            <span>✓ {completed}{target ? ` / ${target}` : ""}</span>
          </div>
          <button onClick={endGame} style={btnStyle(false, true)}>{t.stop}</button>
        </div>
        {progress !== null && <div style={{ height: 3, background: border, borderRadius: 99, marginBottom: 24, width: "100%", maxWidth: 520 }}><div style={{ width: `${progress}%`, height: "100%", background: accent, borderRadius: 99 }} /></div>}
        <div style={{ width: "100%", maxWidth: 520 }}>
          <div style={{ ...cardStyle, textAlign: "center", padding: "40px 24px", border: `2px solid ${flashColor || border}` }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: textMuted, marginBottom: 16 }}>
              {scriptSource === "hiragana" ? t.hiragana : scriptSource === "katakana" ? "Katakana" : customFileName}
            </div>
            <div style={{ fontSize: 72, lineHeight: 1.2, fontWeight: 500, marginBottom: 20 }}>{currentWord.kana}</div>
            {currentWord.czech && <div style={{ fontSize: 13, color: textMuted }}>{t.meaning}: {lang === "cz" ? currentWord.czech : (currentWord.english || currentWord.czech)}</div>}
          </div>
          <input ref={inputRef} type="text" value={input} onChange={e => handleInput(e.target.value)} placeholder={t.typeHere} autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ width: "100%", marginTop: 16, padding: "16px 18px", fontSize: 20, borderRadius: 12, border: `2px solid ${flashColor || border}`, background: surface, color: text, outline: "none", textAlign: "center" }} />
        </div>
      </div>
    );
  }
  
  // =============== VÝSLEDKY ===============
  if (screen === "results") {
    const avg = completed > 0 ? timer / completed : 0;
    const isCompetition = gameMode === "competition50" || gameMode === "competition100";
    return (
      <div style={baseStyle}>
        {topBar}
        <div style={{ width: "100%", maxWidth: 520, marginTop: 20 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>{t.results}</h2>
          </div>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${border}` }}>
              <span>{t.finalTime}</span><strong>{formatTime(timer)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${border}` }}>
              <span>{t.wordsCompleted}</span><strong>{completed}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span>{t.avgPerWord}</span><strong>{formatTime(Math.round(avg))}</strong>
            </div>
            {isCompetition && user && <div style={{ marginTop: 12, padding: 8, background: accentLight, borderRadius: 8, fontSize: 13, textAlign: "center" }}>🏆 Skóre uloženo do žebříčku!</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={goMenu} style={{ ...btnStyle(false), flex: 1 }}>{t.backToMenu}</button>
              <button onClick={startGame} style={{ ...btnStyle(true), flex: 1 }}>{t.playAgain}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ===================== PŘEKLADY =====================
const T = {
  cz: {
    title: "Kana Practice",
    subtitle: "Procvič si čtení hiragany a katakany",
    mode: "Zdroj slov",
    hiragana: "Hiragana",
    custom: "Vlastní",
    loadFile: "Načíst .txt soubor",
    loaded: "Načteno",
    wordsLabel: "slov",
    fileHint: "Formát: kana _-_ romaji1 _-_ romaji2 _-_ romaji3 _-_ česky _-_ anglicky",
    gameMode: "Režim",
    infinite: "Nekonečný",
    timed: "Na počet",
    wordCount: "Počet slov",
    start: "Začít",
    correct: "Správně!",
    time: "Čas",
    done: "Hotovo",
    results: "Výsledky",
    finalTime: "Celkový čas",
    wordsCompleted: "Dokončená slova",
    avgPerWord: "Průměr na slovo",
    playAgain: "Hrát znovu",
    backToMenu: "Zpět do menu",
    stop: "Ukončit",
    typeHere: "Piš romaji...",
    meaning: "Význam",
  },
  en: {
    title: "Kana Practice",
    subtitle: "Practice reading hiragana and katakana",
    mode: "Word source",
    hiragana: "Hiragana",
    custom: "Custom",
    loadFile: "Load .txt file",
    loaded: "Loaded",
    wordsLabel: "words",
    fileHint: "Format: kana _-_ romaji1 _-_ romaji2 _-_ romaji3 _-_ czech _-_ english",
    gameMode: "Mode",
    infinite: "Infinite",
    timed: "Fixed count",
    wordCount: "Word count",
    start: "Start",
    correct: "Correct!",
    time: "Time",
    done: "Done",
    results: "Results",
    finalTime: "Total time",
    wordsCompleted: "Words completed",
    avgPerWord: "Average per word",
    playAgain: "Play again",
    backToMenu: "Back to menu",
    stop: "Stop",
    typeHere: "Type romaji...",
    meaning: "Meaning",
  }
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
