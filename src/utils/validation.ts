import { ContactType, UsaIdType } from '../types';

export interface UsStateSpec {
  code: string;
  name: string;
  regex: RegExp;
  hint: string;
}

export const US_STATES: UsStateSpec[] = [
  { code: 'AL', name: 'Alabama', regex: /^[0-9]{7,8}$/, hint: '7 to 8 digits (e.g. 4829104)' },
  { code: 'AK', name: 'Alaska', regex: /^[0-9]{7}$/, hint: '7 digits (e.g. 7391842)' },
  { code: 'AZ', name: 'Arizona', regex: /^([A-Z][0-9]{8}|[0-9]{9})$/, hint: '1 letter + 8 digits or 9 digits (e.g. D48291048)' },
  { code: 'AR', name: 'Arkansas', regex: /^[0-9]{8,9}$/, hint: '8 to 9 digits (e.g. 92847102)' },
  { code: 'CA', name: 'California', regex: /^[A-Z][0-9]{7}$/, hint: '1 letter + 7 digits (e.g. D4829104)' },
  { code: 'CO', name: 'Colorado', regex: /^[0-9]{9}$/, hint: '9 digits (e.g. 918273645)' },
  { code: 'CT', name: 'Connecticut', regex: /^[0-9]{9}$/, hint: '9 digits (e.g. 192837465)' },
  { code: 'DE', name: 'Delaware', regex: /^[0-9]{7}$/, hint: '7 digits (e.g. 5829104)' },
  { code: 'DC', name: 'District of Columbia', regex: /^[0-9]{7}$/, hint: '7 digits (e.g. 6381920)' },
  { code: 'FL', name: 'Florida', regex: /^[A-Z][0-9]{12}$/, hint: '1 letter + 12 digits (e.g. F482910473829)' },
  { code: 'GA', name: 'Georgia', regex: /^[0-9]{7,9}$/, hint: '7 to 9 digits (e.g. 048291048)' },
  { code: 'HI', name: 'Hawaii', regex: /^([A-Z][0-9]{8}|[0-9]{9})$/, hint: 'H + 8 digits or 9 digits (e.g. H48291048)' },
  { code: 'ID', name: 'Idaho', regex: /^([A-Z]{2}[0-9]{6}[A-Z]|[0-9]{9})$/, hint: '2 letters + 6 digits + 1 letter or 9 digits' },
  { code: 'IL', name: 'Illinois', regex: /^[A-Z][0-9]{11}$/, hint: '1 letter + 11 digits (e.g. P48291047382)' },
  { code: 'IN', name: 'Indiana', regex: /^[0-9]{10}$/, hint: '10 digits (e.g. 4829104738)' },
  { code: 'IA', name: 'Iowa', regex: /^([0-9]{9}|[0-9]{3}[A-Z]{2}[0-9]{4})$/, hint: '9 digits or 3 digits + 2 letters + 4 digits' },
  { code: 'KS', name: 'Kansas', regex: /^([A-Z][0-9]{8}|[0-9]{9})$/, hint: 'K + 8 digits or 9 digits (e.g. K48291048)' },
  { code: 'KY', name: 'Kentucky', regex: /^[A-Z][0-9]{8,9}$/, hint: '1 letter + 8 to 9 digits (e.g. K48291048)' },
  { code: 'LA', name: 'Louisiana', regex: /^[0-9]{7,9}$/, hint: '7 to 9 digits (e.g. 004829104)' },
  { code: 'ME', name: 'Maine', regex: /^[0-9]{7,8}$/, hint: '7 to 8 digits (e.g. 4829104)' },
  { code: 'MD', name: 'Maryland', regex: /^[A-Z][0-9]{12}$/, hint: '1 letter + 12 digits (e.g. M482910473829)' },
  { code: 'MA', name: 'Massachusetts', regex: /^([A-Z][0-9]{8}|[0-9]{9})$/, hint: 'S + 8 digits or 9 digits (e.g. S48291048)' },
  { code: 'MI', name: 'Michigan', regex: /^[A-Z][0-9]{10,12}$/, hint: '1 letter + 10 to 12 digits' },
  { code: 'MN', name: 'Minnesota', regex: /^[A-Z][0-9]{12}$/, hint: '1 letter + 12 digits' },
  { code: 'MS', name: 'Mississippi', regex: /^[0-9]{9}$/, hint: '9 digits (e.g. 847291038)' },
  { code: 'MO', name: 'Missouri', regex: /^([A-Z][0-9]{5,9}|[0-9]{9})$/, hint: '1 letter + 5-9 digits or 9 digits' },
  { code: 'MT', name: 'Montana', regex: /^([A-Z0-9]{9,13})$/, hint: '9 to 13 alphanumeric characters' },
  { code: 'NE', name: 'Nebraska', regex: /^[A-Z][0-9]{6,8}$/, hint: '1 letter + 6 to 8 digits (e.g. A4829104)' },
  { code: 'NV', name: 'Nevada', regex: /^[0-9]{9,12}$/, hint: '9 to 12 digits (e.g. 1928374650)' },
  { code: 'NH', name: 'New Hampshire', regex: /^[A-Z0-9]{8,10}$/, hint: '8 to 10 alphanumeric characters' },
  { code: 'NJ', name: 'New Jersey', regex: /^[A-Z][0-9]{14}$/, hint: '1 letter + 14 digits' },
  { code: 'NM', name: 'New Mexico', regex: /^[0-9]{8,9}$/, hint: '8 to 9 digits (e.g. 839201748)' },
  { code: 'NY', name: 'New York', regex: /^[0-9]{8,9}$/, hint: '8 or 9 digits (e.g. 748291048)' },
  { code: 'NC', name: 'North Carolina', regex: /^[0-9]{7,12}$/, hint: '7 to 12 digits (e.g. 00048291048)' },
  { code: 'ND', name: 'North Dakota', regex: /^([A-Z]{3}[0-9]{6}|[0-9]{9})$/, hint: '3 letters + 6 digits or 9 digits' },
  { code: 'OH', name: 'Ohio', regex: /^[A-Z]{2}[0-9]{6}$/, hint: '2 letters + 6 digits (e.g. AB482910)' },
  { code: 'OK', name: 'Oklahoma', regex: /^[A-Z]?[0-9]{9}$/, hint: '9 digits or 1 letter + 9 digits' },
  { code: 'OR', name: 'Oregon', regex: /^[A-Z0-9]{7,9}$/, hint: '7 to 9 digits/characters' },
  { code: 'PA', name: 'Pennsylvania', regex: /^[0-9]{8}$/, hint: '8 digits (e.g. 48291048)' },
  { code: 'RI', name: 'Rhode Island', regex: /^([0-9]{7}|V[0-9]{6})$/, hint: '7 digits or V + 6 digits' },
  { code: 'SC', name: 'South Carolina', regex: /^[0-9]{7,11}$/, hint: '7 to 11 digits' },
  { code: 'SD', name: 'South Dakota', regex: /^[0-9]{6,10}$/, hint: '6 to 10 digits' },
  { code: 'TN', name: 'Tennessee', regex: /^[0-9]{7,9}$/, hint: '7 to 9 digits' },
  { code: 'TX', name: 'Texas', regex: /^[0-9]{7,8}$/, hint: '7 or 8 digits (e.g. 48291048)' },
  { code: 'UT', name: 'Utah', regex: /^[0-9]{4,10}$/, hint: '4 to 10 digits' },
  { code: 'VT', name: 'Vermont', regex: /^([0-9]{8}|[0-9]{7}[A-Z])$/, hint: '8 digits or 7 digits + A' },
  { code: 'VA', name: 'Virginia', regex: /^([A-Z][0-9]{8}|[0-9]{9})$/, hint: '1 letter + 8 digits or 9 digits' },
  { code: 'WA', name: 'Washington', regex: /^[A-Z0-9]{7,12}$/, hint: '7 to 12 alphanumeric characters' },
  { code: 'WV', name: 'West Virginia', regex: /^[A-Z0-9]{7}$/, hint: '7 alphanumeric characters' },
  { code: 'WI', name: 'Wisconsin', regex: /^[A-Z][0-9]{13}$/, hint: '1 letter + 13 digits' },
  { code: 'WY', name: 'Wyoming', regex: /^[0-9]{9,10}$/, hint: '9 to 10 digits' },
];

function pureJsSha256Hex(asciiInput: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const bytes = Array.from(new TextEncoder().encode(asciiInput));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push(
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff
  );

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const W = new Array<number>(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      W[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  return H.map((v) => v.toString(16).padStart(8, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const prefixed = `moneylink_v1:${value}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(prefixed);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return pureJsSha256Hex(prefixed);
    }
  }
  return pureJsSha256Hex(prefixed);
}

export function validateContactInput(raw: string): {
  valid: boolean;
  type: ContactType;
  normalized: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      type: 'email',
      normalized: '',
      error: 'Enter your email address or mobile phone number.',
    };
  }

  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(lower)) {
      return {
        valid: false,
        type: 'email',
        normalized: lower,
        error: 'Enter a valid email address or mobile phone number.',
      };
    }
    const isGmail = lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com');
    return { valid: true, type: isGmail ? 'gmail' : 'email', normalized: lower };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return {
      valid: false,
      type: 'phone',
      normalized: digits,
      error: 'Enter a valid phone number (7–15 digits) or email address.',
    };
  }

  // Format US 10/11-digit, Nigerian 11-digit (070/080/081/090/091), or international numbers cleanly
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    return {
      valid: true,
      type: 'phone',
      normalized: `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    };
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const us = digits.slice(1);
    return {
      valid: true,
      type: 'phone',
      normalized: `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`,
    };
  }
  if (digits.length === 11 && /^0[789][01]/.test(digits)) {
    return {
      valid: true,
      type: 'phone',
      normalized: `+234 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`,
    };
  }

  return {
    valid: true,
    type: 'phone',
    normalized: trimmed.startsWith('+') ? `+${digits}` : digits,
  };
}

export function validateUsaIdCode(
  rawCode: string,
  stateCode: string,
  idType: UsaIdType
): { valid: boolean; normalized: string; masked: string; stateMatched?: boolean; error?: string } {
  const cleaned = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) {
    return {
      valid: false,
      normalized: '',
      masked: '',
      error: 'USA Government ID code is required. You cannot sign up without a USA ID.',
    };
  }

  if (cleaned.length < 6 || cleaned.length > 18) {
    return {
      valid: false,
      normalized: cleaned,
      masked: '',
      error: 'USA ID code must be between 6 and 18 alphanumeric characters (e.g. D4829104).',
    };
  }

  if (!/[0-9]{4,}/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      masked: '',
      error: 'Valid USA ID codes must include numeric document digits (e.g. D4829104 or 48291048).',
    };
  }

  // Reject trivial fake patterns (all identical characters or obvious sequential test strings)
  const blockedFakes = new Set([
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '987654321',
    'A1234567',
    'D1234567',
    'C12345678',
  ]);
  if (/^(.)\1{5,}$/.test(cleaned) || blockedFakes.has(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      masked: '',
      error: 'Placeholder or sequential ID detected. Enter an authentic USA Government ID code.',
    };
  }

  if (idType === 'passport_card') {
    if (!/^[A-Z0-9]{8,9}$/.test(cleaned)) {
      return {
        valid: false,
        normalized: cleaned,
        masked: '',
        error: 'US Passport Card code must be 8–9 characters (e.g. C48291048).',
      };
    }
    const last4 = cleaned.slice(-4);
    return {
      valid: true,
      normalized: cleaned,
      masked: `USPC-••••${last4}`,
      stateMatched: /^C[0-9]{8}$/.test(cleaned),
    };
  }

  const stateSpec = US_STATES.find((s) => s.code === stateCode);
  if (!stateSpec) {
    return { valid: false, normalized: cleaned, masked: '', error: 'Select an issuing US state.' };
  }

  const matchesExactStateDmv = stateSpec.regex.test(cleaned);
  const matchesStandardUsId = /^[A-Z]{0,3}[0-9]{6,14}[A-Z]{0,2}$/.test(cleaned);

  if (!matchesExactStateDmv && !matchesStandardUsId) {
    return {
      valid: false,
      normalized: cleaned,
      masked: '',
      error: `Invalid USA ID structure. Example for ${stateSpec.name}: ${stateSpec.hint}.`,
    };
  }

  const last4 = cleaned.slice(-4);
  return {
    valid: true,
    normalized: cleaned,
    masked: `${stateSpec.code}-••••${last4}`,
    stateMatched: matchesExactStateDmv,
  };
}

export function formatUsdMicros(micros: number, decimals: 2 | 4 = 2): string {
  const safeMicros = Number.isFinite(micros) ? Math.max(0, micros) : 0;
  const dollars = safeMicros / 1_000_000;
  return `$${dollars.toFixed(decimals)}`;
}

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getDateBuckets(date: Date = new Date()): {
  hourKey: string;
  dayKey: string;
  monthKey: string;
  yearKey: string;
} {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  return {
    yearKey: y,
    monthKey: `${y}-${m}`,
    dayKey: `${y}-${m}-${d}`,
    hourKey: `${y}-${m}-${d}T${h}`,
  };
}

export interface HardwareNodeSnapshot {
  deviceName: string;
  platform: string;
  isMobile: boolean;
  batteryPercent: number;
  networkLabel: string;
  online: boolean;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
  connection?: { effectiveType?: string; type?: string };
}

export async function inspectHardwareNode(): Promise<HardwareNodeSnapshot> {
  const ua = navigator.userAgent || '';
  let deviceName = 'Desktop Browser Node';
  let platform = 'Web OS';
  let isMobile = false;

  if (/iPhone/i.test(ua)) {
    deviceName = 'Apple iPhone';
    platform = 'iOS Safari / Mobile';
    isMobile = true;
  } else if (/iPad/i.test(ua)) {
    deviceName = 'Apple iPad';
    platform = 'iPadOS';
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    const modelMatch = ua.match(/Android\s[0-9.]+;\s([^;)]+)/i);
    const model = modelMatch?.[1]?.trim();
    deviceName = model && model.length <= 36 ? `Android (${model})` : 'Android Smartphone';
    platform = 'Android Mobile';
    isMobile = true;
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceName = 'Mac Workstation';
    platform = 'macOS';
  } else if (/Windows/i.test(ua)) {
    deviceName = 'Windows Device';
    platform = 'Windows';
  } else if (/Linux/i.test(ua)) {
    deviceName = 'Linux Node';
    platform = 'Linux';
  }

  const nav = navigator as NavigatorWithBattery;
  let batteryPercent = 100;
  if (typeof nav.getBattery === 'function') {
    try {
      const bat = await nav.getBattery();
      batteryPercent = Math.round(Math.min(100, Math.max(0, bat.level * 100)));
    } catch {
      batteryPercent = 100;
    }
  }

  const online = navigator.onLine;
  const effType = nav.connection?.effectiveType?.toUpperCase();
  const networkLabel = !online
    ? 'Offline'
    : effType
      ? `Online (${effType})`
      : isMobile
        ? 'Mobile Data / Wi-Fi'
        : 'Broadband Online';

  return {
    deviceName,
    platform,
    isMobile,
    batteryPercent,
    networkLabel,
    online,
  };
}

export async function measureRealNetworkLatency(): Promise<{ reachable: boolean; latencyMs: number }> {
  if (!navigator.onLine) {
    return { reachable: false, latencyMs: 0 };
  }
  const start = performance.now();
  try {
    const res = await fetch(`/api/ping?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const elapsed = Math.max(1, Math.min(9999, Math.round(performance.now() - start)));
    if (res.ok || res.status < 500) {
      return { reachable: true, latencyMs: elapsed };
    }
  } catch {
    // Fallback to origin check
  }

  try {
    const res = await fetch(`${window.location.origin}/?ping=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    const elapsed = Math.max(1, Math.min(9999, Math.round(performance.now() - start)));
    return { reachable: res.ok || res.status < 500, latencyMs: elapsed };
  } catch {
    return { reachable: navigator.onLine, latencyMs: 24 };
  }
}

export function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join('');
  return `ML-${chars}`;
}

export function generateSafeId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`;
}
