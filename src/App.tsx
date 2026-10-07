import { useState, useRef, useEffect, useCallback } from 'react';

// ─── COSTANTI ───────────────────────────────────────────────
const PIN_HASH = 'c08ee2a296e9cc80f185cf84596b17f6dc4e29df05c403f2b0fb077876289cb8';
const WEBHOOK_URL = 'https://cloud.activepieces.com/api/v1/webhooks/vXp3uN0xT3aCyDJfgLAY3';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1jPheamvu0wCP4SkDx3TUffJH8X8hOQecDBByp3sREEs/edit?gid=0#gid=0';

// ─── SHA-256 (Web Crypto + fallback JS puro) ───────────────
async function sha256(text: string): Promise<string> {
  if (crypto?.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fallback */ }
  }
  return sha256Fallback(text);
}

function sha256Fallback(msg: string): string {
  const rr = (v: number, a: number) => (v >>> a) | (v << (32 - a));
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  let [h0,h1,h2,h3,h4,h5,h6,h7] = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = new TextEncoder().encode(msg);
  const len = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[15] = len * 8;
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let i = 0; i < 64; i++) {
      if (i >= 16) w[i] = (w[i-16] + (rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3)) + w[i-7] + (rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10))) | 0;
      const t1 = (h + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e&f)^(~e&g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a,2)^rr(a,13)^rr(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v => (v>>>0).toString(16).padStart(8,'0')).join('');
}

// ─── LOCK SCREEN ────────────────────────────────────────────
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { setTimeout(() => refs.current[0]?.focus(), 150); }, []);

  const onChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(false);
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (next.every(x => x !== '')) checkPin(next.join(''));
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && digits[i] === '' && i > 0) {
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      refs.current[i - 1]?.focus();
    }
  };

  const checkPin = async (pin: string) => {
    const hash = await sha256(pin);
    if (hash === PIN_HASH) {
      onUnlock();
    } else {
      setShake(true);
      setError(true);
      setTimeout(() => {
        setShake(false);
        setDigits(['', '', '', '']);
        setError(false);
        refs.current[0]?.focus();
      }, 600);
    }
  };

  return (
    <div className="lock-bg">
      <div className={`lock-card ${shake ? 'shake' : ''}`}>
        <div className="lock-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1>Inserisci il PIN</h1>
        <p className="subtitle">Digita il codice di 4 cifre</p>

        <div className="pin-boxes">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { refs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={d}
              onChange={e => onChange(i, e.target.value)}
              onKeyDown={e => onKeyDown(i, e)}
              className={`pin-box ${error ? 'pin-error' : d ? 'pin-filled' : ''}`}
            />
          ))}
        </div>

        <p className={`error-msg ${error ? 'visible' : ''}`}>PIN errato. Riprova.</p>
      </div>
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────
function Dashboard() {
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const notify = useCallback((type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleSearch = async () => {
    if (!category.trim() || !city.trim()) {
      notify('err', 'Compila entrambi i campi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: category.trim(), city: city.trim() })
      });
      notify(res.ok ? 'ok' : 'err', res.ok ? 'Ricerca inviata con successo!' : 'Errore nella ricerca.');
    } catch {
      notify('err', 'Errore di connessione.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dash-bg">
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === 'ok' ? 'toast-ok' : 'toast-err'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="dash-header">
        <div className="header-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <div>
          <h1>Ricerca Professionisti</h1>
          <p className="subtitle">Trova professionisti nella tua città</p>
        </div>
      </header>

      {/* Form Card */}
      <div className="card">
        <div className="field">
          <label>Categoria / Professione</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="es. Psicologo, Avvocato..."
          />
        </div>

        <div className="field">
          <label>Città</label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="es. Milano, Roma..."
          />
        </div>

        <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              <span>Invio in corso...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Cerca</span>
            </>
          )}
        </button>
      </div>

      {/* Google Sheet Button */}
      <button className="btn btn-sheet" onClick={() => window.open(SHEET_URL, '_blank', 'noopener,noreferrer')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>Apri Foglio Google</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>

      {/* Info */}
      <div className="info-card">
        <div className="info-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
        </div>
        <div>
          <p className="info-title">Come funziona</p>
          <p className="info-text">Inserisci categoria e città, premi "Cerca" per inviare la richiesta, oppure consulta il foglio Google con tutti i risultati.</p>
        </div>
      </div>

      <footer className="dash-footer">© 2024 — Ricerca Professionisti</footer>
    </div>
  );
}

// ─── APP ────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <Dashboard /> : <LockScreen onUnlock={() => setUnlocked(true)} />;
}
