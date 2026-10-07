import { useState, useRef, useEffect, useCallback } from 'react';

// SHA-256 hash of "1706" - precomputed, PIN is never stored in plaintext
const PIN_HASH = 'c08ee2a296e9cc80f185cf84596b17f6dc4e29df05c403f2b0fb077876289cb8';

// Pure JS SHA-256 implementation (fallback for non-secure contexts)
function sha256Pure(message: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let bytes = new TextEncoder().encode(message);
  const len = bytes.length;
  let words: number[] = [];
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  const bitLen = len * 8;
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[15] = bitLen % maxWord;
  if (bitLen >= maxWord) {
    words[14] = Math.floor(bitLen / maxWord);
  }

  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const _h0 = h0, _h1 = h1, _h2 = h2, _h3 = h3, _h4 = h4, _h5 = h5, _h6 = h6, _h7 = h7;

    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const S1 = rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25);
      const ch = (h4 & h5) ^ (~h4 & h6);
      const temp1 = (h7 + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22);
      const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
      const temp2 = (S0 + maj) | 0;

      h7 = h6;
      h6 = h5;
      h5 = h4;
      h4 = (h3 + temp1) | 0;
      h3 = h2;
      h2 = h1;
      h1 = h0;
      h0 = (temp1 + temp2) | 0;
    }

    h0 = (h0 + _h0) | 0;
    h1 = (h1 + _h1) | 0;
    h2 = (h2 + _h2) | 0;
    h3 = (h3 + _h3) | 0;
    h4 = (h4 + _h4) | 0;
    h5 = (h5 + _h5) | 0;
    h6 = (h6 + _h6) | 0;
    h7 = (h7 + _h7) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

async function computeSHA256(text: string): Promise<string> {
  // Try Web Crypto API first (works in HTTPS contexts)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to pure JS implementation
    }
  }
  // Fallback: pure JS SHA-256
  return sha256Pure(text);
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 1) return;

    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);
    setError(false);

    if (cleaned && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if all digits are filled
    if (newDigits.every(d => d !== '')) {
      const pin = newDigits.join('');
      verifyPin(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index] === '' && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    }
  };

  const verifyPin = async (pin: string) => {
    const hash = await computeSHA256(pin);
    if (hash === PIN_HASH) {
      onUnlock();
    } else {
      setShaking(true);
      setError(true);
      setTimeout(() => {
        setShaking(false);
        setDigits(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 600);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-4">
      <div className={`flex flex-col items-center ${shaking ? 'animate-shake' : ''}`}>
        {/* Lock Icon */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-2">Inserisci il PIN</h1>
        <p className="text-gray-400 text-sm mb-8">Digita il codice di 4 cifre per accedere</p>

        {/* PIN Input Boxes */}
        <div className="flex gap-3 mb-6">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={el => { inputRefs.current[index] = el; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 transition-all duration-200 outline-none
                ${error
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : digit
                    ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-lg shadow-indigo-500/20'
                    : 'border-gray-600 bg-gray-800/50 text-white focus:border-indigo-400 focus:shadow-lg focus:shadow-indigo-500/20'
                }`}
            />
          ))}
        </div>

        {/* Error Message */}
        <div className={`h-6 transition-all duration-300 ${error ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-red-400 text-sm font-medium">PIN errato. Riprova.</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const handleSearch = async () => {
    if (!category.trim() || !city.trim()) {
      showNotification('error', 'Compila entrambi i campi per cercare.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://cloud.activepieces.com/api/v1/webhooks/vXp3uN0xT3aCyDJfgLAY3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: category.trim(),
          city: city.trim()
        })
      });

      if (response.ok) {
        showNotification('success', 'Ricerca inviata con successo!');
      } else {
        showNotification('error', 'Errore nella ricerca. Riprova.');
      }
    } catch {
      showNotification('error', 'Errore di connessione. Verifica la tua rete.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSheet = () => {
    window.open(
      'https://docs.google.com/spreadsheets/d/1jPheamvu0wCP4SkDx3TUffJH8X8hOQecDBByp3sREEs/edit?gid=0#gid=0',
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-4 flex flex-col">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl transition-all duration-300 animate-slideDown
          ${notification.type === 'success'
            ? 'bg-emerald-500/90 text-white border border-emerald-400/50'
            : 'bg-red-500/90 text-white border border-red-400/50'
          }`}>
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Ricerca Professionisti</h1>
        </div>
        <p className="text-gray-400 text-sm ml-[52px]">Trova professionisti nella tua città</p>
      </header>

      {/* Search Form */}
      <main className="w-full max-w-lg mx-auto flex-1">
        <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-5 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Cerca
          </h2>

          {/* Category Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Categoria / Professione
            </label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="es. Psicologo, Avvocato..."
              className="w-full px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-600/50 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
            />
          </div>

          {/* City Field */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Città
            </label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="es. Milano, Roma..."
              className="w-full px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-600/50 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
            />
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Invio in corso...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Cerca</span>
              </>
            )}
          </button>
        </div>

        {/* Google Sheet Button */}
        <div className="mt-5">
          <button
            onClick={handleOpenSheet}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Apri Foglio Google</span>
            <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>

        {/* Info Card */}
        <div className="mt-5 bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-300 font-medium">Come funziona</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Inserisci la categoria professionale e la città, poi premi "Cerca" per inviare la richiesta.
                Puoi anche consultare direttamente il foglio Google con tutti i risultati.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-lg mx-auto py-4 mt-auto">
        <p className="text-center text-xs text-gray-600">
          © 2024 — Ricerca Professionisti
        </p>
      </footer>
    </div>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return <Dashboard />;
}

export default App;
