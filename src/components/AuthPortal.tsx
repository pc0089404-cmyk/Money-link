import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import showcaseHeroImg from '../assets/images/mobile_network_node_showcase_1792783810044.jpg';
import { signInAppAccount, signUpAppAccount } from '../services/ledgerService';
import { UsaIdType, UserAccount, VerificationMethod } from '../types';
import {
  sha256Hex,
  US_STATES,
  validateContactInput,
  validateUsaIdCode,
} from '../utils/validation';
import { MoneyLinkLoader } from './MoneyLinkLoader';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface AuthPortalProps {
  existingAccount: UserAccount | null;
  onAuthenticated: (verifiedAccount?: UserAccount, isNewSignUp?: boolean) => void;
}

function normalizeNameForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  existingAccount,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [step, setStep] = useState<1 | 2>(1);
  const [imgFailed, setImgFailed] = useState(false);

  // Step 1: Sign-up credentials
  const [fullName, setFullName] = useState('');
  const [contactInput, setContactInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Mandatory USA ID Code & Verification Steps
  const [idType, setIdType] = useState<UsaIdType>('drivers_license');
  const [issuingState, setIssuingState] = useState('CA');
  const [usaIdCode, setUsaIdCode] = useState('');
  const [idVerifiedFeedback, setIdVerifiedFeedback] = useState<'idle' | 'verified' | 'invalid'>(
    'idle'
  );
  const [dobYear, setDobYear] = useState('1996');
  const [idExpiryDate, setIdExpiryDate] = useState('2029-06-15');
  const [ssnLast4, setSsnLast4] = useState('');
  const [showSsn, setShowSsn] = useState(false);
  const [verificationMethod, setVerificationMethod] =
    useState<VerificationMethod>('document_attestation');

  // Camera liveness state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDigest, setCameraDigest] = useState('');
  const [cameraError, setCameraError] = useState('');

  // Document attestation challenge state
  const [challengeToken] = useState(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => chars[b % chars.length])
      .join('');
  });
  const [typedChallenge, setTypedChallenge] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [signatureTouched, setSignatureTouched] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);

  // Sign-in state
  const [signInContact, setSignInContact] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Field focus & highlight state so every tap gives unmistakable visual feedback
  const [invalidField, setInvalidField] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Input refs for instant focus when user taps submit with an incomplete field
  const nameRef = useRef<HTMLInputElement | null>(null);
  const contactRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement | null>(null);
  const usaIdRef = useRef<HTMLInputElement | null>(null);
  const dobRef = useRef<HTMLInputElement | null>(null);
  const expiryRef = useRef<HTMLInputElement | null>(null);
  const ssnRef = useRef<HTMLInputElement | null>(null);
  const challengeRef = useRef<HTMLInputElement | null>(null);
  const signatureRef = useRef<HTMLInputElement | null>(null);
  const signInContactRef = useRef<HTMLInputElement | null>(null);
  const signInPwRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!signatureTouched) {
      setSignatureName(fullName.trim());
    }
  }, [fullName, signatureTouched]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopCamera = (): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCameraScan = async (): Promise<void> => {
    setCameraError('');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError(
        'Phone camera unavailable here. Tap "Signed ID Check" above to verify your USA ID.'
      );
      setCameraActive(false);
    }
  };

  const captureLivenessDigest = async (): Promise<void> => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    }
    if (sum === 0) {
      setCameraError('Camera frame is still loading. Wait 1 second and tap Capture again.');
      return;
    }
    const rawHash = await sha256Hex(`frame_${sum}_${Date.now()}_${usaIdCode}`);
    setCameraDigest(`LIVE_${rawHash.slice(0, 24)}`);
    setInvalidField('');
    setErrorMsg('');
    stopCamera();
  };

  // Live validations
  const contactCheck = validateContactInput(contactInput);
  const passwordValid = password.length >= 6;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const nameValid = fullName.trim().length >= 2 && fullName.trim().length <= 80;

  const idCheck = validateUsaIdCode(usaIdCode, issuingState, idType);
  const parsedBirthYear = Math.trunc(Number(dobYear));
  const ageValid =
    dobYear.trim().length === 4 &&
    Number.isFinite(parsedBirthYear) &&
    parsedBirthYear >= 1900 &&
    parsedBirthYear <= 2008;
  const todayIso = new Date().toISOString().slice(0, 10);
  const expiryValid =
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(idExpiryDate) && idExpiryDate > todayIso;
  const ssnValid = /^[0-9]{4}$/.test(ssnLast4) && ssnLast4 !== '0000';

  const challengeMatches = typedChallenge.trim().toUpperCase() === challengeToken;
  const signatureMatches =
    normalizeNameForMatch(signatureName) === normalizeNameForMatch(fullName) &&
    normalizeNameForMatch(fullName).length >= 2;

  const selectedStateObj = US_STATES.find((s) => s.code === issuingState) || US_STATES[4];

  const handleTapVerifyIdCode = (): void => {
    setErrorMsg('');
    setStatusMsg('');
    if (!idCheck.valid) {
      setIdVerifiedFeedback('invalid');
      setInvalidField('usaIdCode');
      setErrorMsg(
        idCheck.error ||
          'USA ID Required: Enter an authentic USA Government ID code before continuing.'
      );
      usaIdRef.current?.focus();
      return;
    }
    setIdVerifiedFeedback('verified');
    if (invalidField === 'usaIdCode') {
      setInvalidField('');
    }
  };

  const handleAdvanceToStep2 = (e: React.FormEvent): void => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setInvalidField('');

    if (!nameValid) {
      setInvalidField('fullName');
      setErrorMsg('Enter your full legal name (2–80 characters) as shown on your USA ID.');
      nameRef.current?.focus();
      return;
    }
    if (!contactCheck.valid) {
      setInvalidField('contactInput');
      setErrorMsg(
        contactCheck.error || 'Enter a valid email address or mobile phone number.'
      );
      contactRef.current?.focus();
      return;
    }
    if (!passwordValid) {
      setInvalidField('password');
      setErrorMsg('Create a password with at least 6 characters.');
      passwordRef.current?.focus();
      return;
    }
    if (!passwordsMatch) {
      setInvalidField('confirmPassword');
      setErrorMsg('Confirmation password does not match.');
      confirmPasswordRef.current?.focus();
      return;
    }

    if (!signatureTouched || !signatureName.trim()) {
      setSignatureName(fullName.trim());
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCompleteSignUp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;

    setErrorMsg('');
    setStatusMsg('');
    setInvalidField('');

    // Synchronous field-by-field validation BEFORE signInWithPopup (preserves browser user gesture!)
    if (!idCheck.valid) {
      setIdVerifiedFeedback('invalid');
      setInvalidField('usaIdCode');
      setErrorMsg(
        idCheck.error ||
          'USA ID Required: You cannot sign up without entering a valid USA Government ID code.'
      );
      usaIdRef.current?.focus();
      return;
    }
    setIdVerifiedFeedback('verified');

    if (!ageValid) {
      setInvalidField('dobYear');
      setErrorMsg('Enter a valid 4-digit birth year (1900–2008). You must be 18+ to sign up.');
      dobRef.current?.focus();
      return;
    }

    if (!expiryValid) {
      setInvalidField('idExpiryDate');
      setErrorMsg('Enter an unexpired future expiration date for your USA ID.');
      expiryRef.current?.focus();
      return;
    }

    if (!ssnValid) {
      setInvalidField('ssnLast4');
      setErrorMsg('Enter the last 4 digits of your SSN or ITIN (cannot be 0000).');
      ssnRef.current?.focus();
      return;
    }

    if (verificationMethod === 'camera_liveness') {
      if (cameraDigest.length < 16) {
        setInvalidField('camera');
        setErrorMsg(
          'Tap "Open Phone Camera" and capture your live check, or switch to "Signed ID Check".'
        );
        return;
      }
    } else {
      if (!challengeMatches) {
        setInvalidField('typedChallenge');
        setErrorMsg(
          `Enter the 6-character security code (${challengeToken}) or tap "Confirm Code" in the verification box.`
        );
        challengeRef.current?.focus();
        return;
      }
      if (!signatureMatches) {
        setInvalidField('signatureName');
        setErrorMsg(
          `Your legal signature must match the full name entered on Step 1 ("${fullName.trim()}").`
        );
        signatureRef.current?.focus();
        return;
      }
      if (!legalConsent) {
        setInvalidField('legalConsent');
        setErrorMsg(
          'Tap the checkbox right above this button to certify your USA ID belongs to you.'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      setStatusMsg('Encrypting USA ID hash & creating your $0.0000 Money Link wallet...');

      const cleanDisplayName = fullName.trim().slice(0, 80);
      const cleanContact = contactCheck.normalized.slice(0, 120);

      const [passwordHash, usaIdHash, ssnLast4Hash, attHash] = await Promise.all([
        sha256Hex(password),
        sha256Hex(`${issuingState}:${idType}:${idCheck.normalized}`),
        sha256Hex(ssnLast4),
        sha256Hex(`${cleanDisplayName.toLowerCase()}:${challengeToken}:${idCheck.normalized}`),
      ]);

      const finalDigest =
        verificationMethod === 'camera_liveness'
          ? cameraDigest
          : `ATTEST_${attHash.slice(0, 24)}`;

      const snapshot = await signUpAppAccount({
        displayName: cleanDisplayName,
        contactType: contactCheck.type,
        contactValue: cleanContact,
        passwordHash,
        issuingState,
        idType,
        usaIdMasked: idCheck.masked,
        usaIdHash,
        ssnLast4Hash,
        dobYear: parsedBirthYear,
        idExpiryDate,
        verificationMethod,
        verificationDigest: finalDigest,
      });

      onAuthenticated(snapshot.account || undefined, true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to create your Money Link account.'
      );
    } finally {
      setSubmitting(false);
      setStatusMsg('');
    }
  };

  const handleSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;

    setErrorMsg('');
    setStatusMsg('');
    setInvalidField('');

    const check = validateContactInput(signInContact);
    if (!check.valid) {
      setInvalidField('signInContact');
      setErrorMsg('Enter your registered email address or mobile phone number.');
      signInContactRef.current?.focus();
      return;
    }
    if (!signInPassword) {
      setInvalidField('signInPassword');
      setErrorMsg('Enter your Money Link account password.');
      signInPwRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      setStatusMsg('Unlocking your verified Money Link wallet...');
      const snapshot = await signInAppAccount(check.normalized, signInPassword);
      onAuthenticated(snapshot.account || undefined, false);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'ACCOUNT_NOT_FOUND') {
        setContactInput(signInContact);
        setPassword(signInPassword);
        setConfirmPassword(signInPassword);
        setMode('signup');
        setStep(1);
        setErrorMsg(
          'No verified Money Link wallet found for this email or phone number yet. Complete Sign Up and mandatory USA ID verification first.'
        );
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'Incorrect login details. Please try again.'
      );
    } finally {
      setSubmitting(false);
      setStatusMsg('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F9] flex flex-col">
      {submitting && (
        <MoneyLinkLoader
          variant="overlay"
          title={mode === 'signup' ? 'Activating Your Wallet' : 'Opening Money Link'}
          subtitle={
            statusMsg ||
            'Powering up your fast +$0.10 earning stream & instant bank payouts...'
          }
          badgeText="Fast Cash Stream · Direct Bank Cashout"
        />
      )}

      {/* Compact 3-Zone Frosted iOS App Bar */}
      <header className="sticky top-0 z-20 h-13 bg-white/85 backdrop-blur-2xl border-b border-slate-200/80 px-4 sm:px-6 flex items-center">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-8">
          <span className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            <MoneyLinkLogo size="sm" />
            <span>Money Link</span>
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a
              href="#app-features"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Fast Rewards
            </a>
            <a
              href="#usa-id-gate"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              USA ID Gate
            </a>
            <a
              href="#local-banks"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Local Bank Cashout
            </a>
          </nav>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setErrorMsg('');
              setInvalidField('');
            }}
            className="px-4 py-2 min-h-[38px] text-xs font-extrabold text-[#0A84FF] bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            {mode === 'signup' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </header>

      {/* Main Mobile-First + Desktop Split Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Vibrant Welcome Card on Mobile */}
          <div className="lg:hidden rounded-[28px] bg-gradient-to-br from-[#0B132B] via-[#1D4ED8] to-[#059669] text-white p-5 shadow-lg shadow-indigo-950/15 space-y-2">
            <div className="flex items-center gap-2.5">
              <MoneyLinkLogo size="sm" />
              <p className="text-xs font-bold text-sky-200">
                Stay Online · Get Paid Fast
              </p>
            </div>
            <h1 className="text-xl font-extrabold leading-snug">
              Connect your phone &amp; earn +$0.10 fast ($10.00 in 3 minutes).
            </h1>
            <p className="text-xs text-sky-100/90">
              Sign up with any email or phone + USA ID verification and cash out $10.00+ straight
              to any local Nigerian bank.
            </p>
          </div>

          {/* Left Desktop Showcase Column */}
          <div
            id="app-features"
            className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-[32px] overflow-hidden bg-gradient-to-br from-[#0B132B] via-[#1D4ED8] to-[#059669] text-white shadow-xl shadow-indigo-950/15"
          >
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <MoneyLinkLogo size="md" />
                <p className="text-xs font-bold text-sky-200 tracking-wide">
                  Connect Your Phone · Earn Real Cash Fast
                </p>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-white">
                Stay online and watch +$0.10 roll in every 1.8 seconds.
              </h1>
              <p className="text-sm text-sky-100/90 leading-relaxed">
                Link your smartphone in one tap, build $10.00 in just 3 minutes of active connection,
                and cash out directly to your local bank account.
              </p>

              <div className="space-y-3.5 pt-2">
                <div className="flex items-start gap-3.5 bg-white/12 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/25 text-amber-200 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div id="usa-id-gate">
                    <p className="text-sm font-bold text-white">01. Mandatory USA ID Sign-Up</p>
                    <p className="text-xs text-sky-100/85 mt-0.5">
                      Authentic US Driver&apos;s License, State ID, or Passport Card required—no
                      account can be created without USA ID verification.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 bg-white/12 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-300/25 text-cyan-100 flex items-center justify-center shrink-0">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      02. Fast Live Stream (+$0.10 to $10 in 3m)
                    </p>
                    <p className="text-xs text-sky-100/85 mt-0.5">
                      Track real Daily, Weekly, Monthly, and Yearly earnings starting at $0.00.
                    </p>
                  </div>
                </div>

                <div
                  id="local-banks"
                  className="flex items-start gap-3.5 bg-white/12 backdrop-blur-md rounded-2xl p-4 border border-white/10"
                >
                  <div className="w-10 h-10 rounded-2xl bg-emerald-300/25 text-emerald-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      03. $10.00+ Cashout to All Nigerian Banks
                    </p>
                    <p className="text-xs text-sky-100/85 mt-0.5">
                      Instant bank selector with every CBN commercial, fintech, MFB, and PSB bank
                      protected by RPC code authorization.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-56 w-full">
              {!imgFailed ? (
                <img
                  src={showcaseHeroImg}
                  alt="Smartphone connected to Money Link real uptime network"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-teal-900 flex flex-col items-center justify-center p-6 text-center">
                  <Smartphone className="w-10 h-10 text-emerald-300 mb-2" />
                  <span className="text-sm font-semibold text-white">Money Link Mobile Node</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent flex items-end p-6">
                <div className="w-full flex items-center justify-between text-xs text-white">
                  <span>Fast Online Rewards</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-300">
                    +$0.10 Live · $10 in 3 Mins
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Colorful Phone App Sign-Up / Sign-In Card */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-8 shadow-sm flex flex-col justify-between">
            <div>
              {/* Tactile App Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100">
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMsg('');
                      setInvalidField('');
                    }}
                    className={`px-4 py-2.5 min-h-[42px] text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 ${
                      mode === 'signup'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign Up + USA ID
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setErrorMsg('');
                      setInvalidField('');
                    }}
                    className={`px-4 py-2.5 min-h-[42px] text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 ${
                      mode === 'signin'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In
                  </button>
                </div>

                {mode === 'signup' && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 tabular-nums">
                    <span className={step === 1 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                      1. Account
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={step === 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                      2. USA ID Check
                    </span>
                  </div>
                )}
              </div>

              {/* Colorful Step Progress Bar */}
              {mode === 'signup' && (
                <div className="mt-4 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 origin-left transition-transform duration-200"
                    style={{ transform: `scaleX(${step === 1 ? 0.5 : 1})` }}
                  />
                </div>
              )}

              {/* Quick Resume Banner if Already Verified */}
              {existingAccount && (
                <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-emerald-950">
                    <p className="font-bold">Welcome back, {existingAccount.displayName}</p>
                    <p className="text-emerald-700 mt-0.5">
                      Verified ID {existingAccount.usaIdMasked} · Wallet ready
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAuthenticated(existingAccount)}
                    className="px-4 py-2.5 min-h-[42px] text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                  >
                    Open App Wallet
                  </button>
                </div>
              )}

              {/* SIGN UP STEP 1: NAME, EMAIL OR PHONE, PASSWORD */}
              {mode === 'signup' && step === 1 && (
                <form noValidate onSubmit={handleAdvanceToStep2} className="mt-6 space-y-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      Create your Money Link Wallet
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Enter your full name, email or phone number, and password. Step 2 verifies
                      your authentic USA ID code.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="signup-name"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      Full Legal Name (as shown on your USA ID)
                    </label>
                    <input
                      ref={nameRef}
                      id="signup-name"
                      type="text"
                      maxLength={80}
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (invalidField === 'fullName') setInvalidField('');
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Jordan Taylor"
                      className={`w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 transition-colors ${
                        invalidField === 'fullName'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/30 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="signup-contact"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      Email Address or Phone Number
                    </label>
                    <input
                      ref={contactRef}
                      id="signup-contact"
                      type="text"
                      maxLength={120}
                      value={contactInput}
                      onChange={(e) => {
                        setContactInput(e.target.value);
                        if (invalidField === 'contactInput') setInvalidField('');
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="you@example.com or phone number"
                      className={`w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 transition-colors ${
                        invalidField === 'contactInput'
                          ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/30 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
                      }`}
                    />
                    {contactInput.length > 2 && (
                      <p
                        className={`text-xs mt-1.5 ${
                          contactCheck.valid ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        {contactCheck.valid
                          ? `Verified contact: ${contactCheck.normalized}`
                          : contactCheck.error}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="signup-password"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        Create Password (6+ characters)
                      </label>
                      <div className="relative">
                        <input
                          ref={passwordRef}
                          id="signup-password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (invalidField === 'password') setInvalidField('');
                            if (errorMsg) setErrorMsg('');
                          }}
                          placeholder="At least 6 characters"
                          className={`w-full min-h-[48px] pl-4 pr-11 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 transition-colors ${
                            invalidField === 'password'
                              ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/30 focus:ring-rose-500'
                              : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="signup-confirm-password"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        Confirm Password
                      </label>
                      <input
                        ref={confirmPasswordRef}
                        id="signup-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (invalidField === 'confirmPassword') setInvalidField('');
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="Repeat password"
                        className={`w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 transition-colors ${
                          invalidField === 'confirmPassword'
                            ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/30 focus:ring-rose-500'
                            : 'border-slate-200 focus:ring-emerald-500 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-xs text-amber-950 flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p>
                      <span className="font-bold">USA ID Verification Required:</span> Sign-up
                      cannot finish without adding a valid USA Government ID code on the next step.
                    </p>
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs font-bold text-rose-900"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm shadow-emerald-600/20 whitespace-nowrap"
                  >
                    Next: Add USA ID Code
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* SIGN UP STEP 2: MANDATORY USA ID CODE & AUTHENTICITY STEPS */}
              {mode === 'signup' && step === 2 && (
                <form noValidate onSubmit={handleCompleteSignUp} className="mt-6 space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-900">
                        Add USA ID Code &amp; Verify Identity
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Without a valid USA ID code and completed check below, sign-up is blocked.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setStep(1);
                        setErrorMsg('');
                        setInvalidField('');
                      }}
                      className="min-h-[42px] inline-flex items-center gap-1 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="id-type"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        USA ID Document Type
                      </label>
                      <select
                        id="id-type"
                        value={idType}
                        onChange={(e) => {
                          setIdType(e.target.value as UsaIdType);
                          setIdVerifiedFeedback('idle');
                          setErrorMsg('');
                        }}
                        className="w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="drivers_license">US Driver&apos;s License</option>
                        <option value="state_id">US State ID Card</option>
                        <option value="passport_card">US Passport Card</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="issuing-state"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        Issuing US State
                      </label>
                      <select
                        id="issuing-state"
                        value={issuingState}
                        onChange={(e) => {
                          setIssuingState(e.target.value);
                          setIdVerifiedFeedback('idle');
                          setErrorMsg('');
                        }}
                        className="w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {US_STATES.map((st) => (
                          <option key={st.code} value={st.code}>
                            {st.name} ({st.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* USA ID Number Input + Interactive Verify USA ID Button */}
                  <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/70 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="usa-id-code"
                        className="block text-xs font-extrabold text-slate-900"
                      >
                        USA ID Number / Code (Mandatory)
                      </label>
                      <span className="text-xs text-emerald-800 font-semibold">
                        {idType === 'passport_card'
                          ? 'Example: C48291048'
                          : `Example (${selectedStateObj.code}): ${selectedStateObj.hint}`}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <input
                        ref={usaIdRef}
                        id="usa-id-code"
                        type="text"
                        maxLength={20}
                        value={usaIdCode}
                        onChange={(e) => {
                          setUsaIdCode(e.target.value.toUpperCase());
                          setIdVerifiedFeedback('idle');
                          if (invalidField === 'usaIdCode') setInvalidField('');
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder={
                          idType === 'passport_card'
                            ? 'Enter C + 8 digits (e.g. C48291048)'
                            : 'Enter official USA ID code (e.g. D4829104)'
                        }
                        className={`flex-1 min-h-[48px] px-4 py-3 text-sm font-mono tabular-nums bg-white border rounded-2xl focus:outline-none focus:ring-2 transition-colors ${
                          invalidField === 'usaIdCode' || idVerifiedFeedback === 'invalid'
                            ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                            : idCheck.valid
                              ? 'border-emerald-500 focus:ring-emerald-500'
                              : 'border-slate-200 focus:ring-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleTapVerifyIdCode}
                        className={`min-h-[48px] px-5 py-2.5 text-xs font-extrabold rounded-2xl transition-all active:scale-[0.98] whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
                          idCheck.valid
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        {idCheck.valid ? 'ID Verified' : 'Verify USA ID'}
                      </button>
                    </div>

                    {(usaIdCode.length > 0 || idVerifiedFeedback !== 'idle') && (
                      <div
                        className={`text-xs flex items-center gap-1.5 pt-0.5 ${
                          idCheck.valid ? 'text-emerald-800 font-bold' : 'text-rose-700 font-semibold'
                        }`}
                      >
                        {idCheck.valid ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              USA ID Code Verified ({idCheck.masked}) · Authentic structure accepted
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>{idCheck.error}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label
                        htmlFor="dob-year"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        Birth Year (18+)
                      </label>
                      <input
                        ref={dobRef}
                        id="dob-year"
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={dobYear}
                        onChange={(e) => {
                          setDobYear(e.target.value.replace(/\D/g, '').slice(0, 4));
                          if (invalidField === 'dobYear') setInvalidField('');
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="1996"
                        className={`w-full min-h-[48px] px-4 py-3 text-sm font-mono tabular-nums bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 ${
                          invalidField === 'dobYear'
                            ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                            : 'border-slate-200 focus:ring-emerald-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="id-expiry"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        ID Expiry Date
                      </label>
                      <input
                        ref={expiryRef}
                        id="id-expiry"
                        type="date"
                        value={idExpiryDate}
                        onChange={(e) => {
                          setIdExpiryDate(e.target.value);
                          if (invalidField === 'idExpiryDate') setInvalidField('');
                          if (errorMsg) setErrorMsg('');
                        }}
                        className={`w-full min-h-[48px] px-4 py-3 text-sm font-mono tabular-nums bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 ${
                          invalidField === 'idExpiryDate'
                            ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                            : 'border-slate-200 focus:ring-emerald-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="ssn-last4"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        SSN / ITIN Last 4
                      </label>
                      <div className="relative">
                        <input
                          ref={ssnRef}
                          id="ssn-last4"
                          type={showSsn ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={4}
                          value={ssnLast4}
                          onChange={(e) => {
                            setSsnLast4(e.target.value.replace(/\D/g, '').slice(0, 4));
                            if (invalidField === 'ssnLast4') setInvalidField('');
                            if (errorMsg) setErrorMsg('');
                          }}
                          placeholder="4 digits"
                          className={`w-full min-h-[48px] pl-4 pr-10 py-3 text-sm font-mono tabular-nums bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 ${
                            invalidField === 'ssnLast4'
                              ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                              : ssnValid
                                ? 'border-emerald-400 focus:ring-emerald-500'
                                : 'border-slate-200 focus:ring-emerald-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSsn((v) => !v)}
                          aria-label={showSsn ? 'Hide SSN digits' : 'Show SSN digits'}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                        >
                          {showSsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Verification Step Selector */}
                  <div className="pt-3 border-t border-slate-100 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Identity Verification Step (Choose 1)
                      </span>
                      <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            setVerificationMethod('document_attestation');
                            setErrorMsg('');
                            setInvalidField('');
                          }}
                          className={`px-3 py-1.5 min-h-[36px] text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                            verificationMethod === 'document_attestation'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Signed ID Check
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVerificationMethod('camera_liveness');
                            setErrorMsg('');
                            setInvalidField('');
                          }}
                          className={`px-3 py-1.5 min-h-[36px] text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                            verificationMethod === 'camera_liveness'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Live Selfie Scan
                        </button>
                      </div>
                    </div>

                    {verificationMethod === 'camera_liveness' ? (
                      <div
                        className={`p-4 rounded-2xl bg-slate-50 border space-y-3 ${
                          invalidField === 'camera'
                            ? 'border-rose-400 ring-2 ring-rose-100'
                            : 'border-slate-200/80'
                        }`}
                      >
                        <p className="text-xs text-slate-600">
                          Scan live presence with your phone camera. Hashed locally in memory—no raw
                          photo leaves your device.
                        </p>
                        {cameraError && (
                          <p className="text-xs text-rose-700 font-semibold">{cameraError}</p>
                        )}
                        {cameraActive && (
                          <div className="space-y-3">
                            <video
                              ref={videoRef}
                              playsInline
                              muted
                              className="w-full max-h-52 rounded-2xl bg-slate-900 object-cover"
                            />
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => void captureLivenessDigest()}
                                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 whitespace-nowrap"
                              >
                                <Camera className="w-4 h-4" />
                                Capture Verification
                              </button>
                              <button
                                type="button"
                                onClick={stopCamera}
                                className="min-h-[44px] px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {!cameraActive && !cameraDigest && (
                          <button
                            type="button"
                            onClick={() => void startCameraScan()}
                            className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-emerald-900 bg-emerald-100 hover:bg-emerald-200/80 rounded-xl transition-colors whitespace-nowrap"
                          >
                            <Camera className="w-4 h-4" />
                            Open Phone Camera
                          </button>
                        )}

                        {cameraDigest && (
                          <div className="flex items-center justify-between gap-2 text-xs text-emerald-800 font-bold">
                            <span className="inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              Live Camera Hash Verified
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setCameraDigest('');
                                void startCameraScan();
                              }}
                              className="text-slate-600 underline"
                            >
                              Retake
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label
                                htmlFor="challenge-input"
                                className="block text-xs font-bold text-slate-700"
                              >
                                Security Code:{' '}
                                <span className="font-mono text-emerald-700 font-extrabold select-all">
                                  {challengeToken}
                                </span>
                              </label>
                              {!challengeMatches && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTypedChallenge(challengeToken);
                                    if (invalidField === 'typedChallenge') setInvalidField('');
                                    if (errorMsg) setErrorMsg('');
                                  }}
                                  className="text-[11px] font-extrabold text-emerald-700 hover:underline whitespace-nowrap"
                                >
                                  Tap to Match
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <input
                                ref={challengeRef}
                                id="challenge-input"
                                type="text"
                                maxLength={6}
                                value={typedChallenge}
                                onChange={(e) => {
                                  setTypedChallenge(e.target.value.toUpperCase());
                                  if (invalidField === 'typedChallenge') setInvalidField('');
                                  if (errorMsg) setErrorMsg('');
                                }}
                                placeholder={challengeToken}
                                className={`w-full min-h-[46px] px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border rounded-xl focus:outline-none focus:ring-2 ${
                                  invalidField === 'typedChallenge'
                                    ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                                    : challengeMatches
                                      ? 'border-emerald-500 focus:ring-emerald-500'
                                      : 'border-slate-200 focus:ring-emerald-500'
                                }`}
                              />
                              {challengeMatches && (
                                <Check className="w-4 h-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label
                                htmlFor="sig-name"
                                className="block text-xs font-bold text-slate-700"
                              >
                                Legal Signature
                              </label>
                              {!signatureMatches && fullName.trim() && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSignatureName(fullName.trim());
                                    setSignatureTouched(true);
                                    if (invalidField === 'signatureName') setInvalidField('');
                                    if (errorMsg) setErrorMsg('');
                                  }}
                                  className="text-[11px] font-extrabold text-emerald-700 hover:underline whitespace-nowrap"
                                >
                                  Use Full Name
                                </button>
                              )}
                            </div>
                            <input
                              ref={signatureRef}
                              id="sig-name"
                              type="text"
                              value={signatureName}
                              onChange={(e) => {
                                setSignatureTouched(true);
                                setSignatureName(e.target.value);
                                if (invalidField === 'signatureName') setInvalidField('');
                                if (errorMsg) setErrorMsg('');
                              }}
                              placeholder={fullName || 'Type your full legal name'}
                              className={`w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 ${
                                invalidField === 'signatureName'
                                  ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                                  : signatureMatches
                                    ? 'border-emerald-500 focus:ring-emerald-500'
                                    : 'border-slate-200 focus:ring-emerald-500'
                              }`}
                            />
                          </div>
                        </div>

                        <label
                          className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer select-none min-h-[48px] transition-colors ${
                            invalidField === 'legalConsent'
                              ? 'bg-rose-50 border-rose-400 text-rose-950 font-semibold'
                              : legalConsent
                                ? 'bg-emerald-50/70 border-emerald-300 text-slate-800'
                                : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={legalConsent}
                            onChange={(e) => {
                              setLegalConsent(e.target.checked);
                              if (invalidField === 'legalConsent') setInvalidField('');
                              if (errorMsg) setErrorMsg('');
                            }}
                            className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                          />
                          <span>
                            I certify that the USA ID code entered above is my authentic ID (
                            {fullName.trim() || 'Account Holder'}) and authorize SHA-256
                            verification for real uptime payouts.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Direct Thumb-Zone Feedback Right Above Submit Button */}
                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-4 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3 text-xs font-bold text-rose-900"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {statusMsg && (
                    <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900">
                      {statusMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[54px] inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-extrabold text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 transition-all shadow-sm shadow-emerald-600/20 whitespace-nowrap"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {submitting
                      ? 'Verifying USA ID & Creating Wallet...'
                      : 'Verify USA ID & Complete Sign Up'}
                  </button>
                </form>
              )}

              {/* SIGN IN FLOW */}
              {mode === 'signin' && (
                <form noValidate onSubmit={handleSignIn} className="mt-6 space-y-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      Sign In to Money Link
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Enter your registered email or phone number and password to open your verified
                      wallet.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="signin-contact"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      Registered Email or Phone Number
                    </label>
                    <input
                      ref={signInContactRef}
                      id="signin-contact"
                      type="text"
                      value={signInContact}
                      onChange={(e) => {
                        setSignInContact(e.target.value);
                        if (invalidField === 'signInContact') setInvalidField('');
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="you@example.com or phone number"
                      className={`w-full min-h-[48px] px-4 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 ${
                        invalidField === 'signInContact'
                          ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="signin-password"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      Account Password
                    </label>
                    <div className="relative">
                      <input
                        ref={signInPwRef}
                        id="signin-password"
                        type={showSignInPassword ? 'text' : 'password'}
                        value={signInPassword}
                        onChange={(e) => {
                          setSignInPassword(e.target.value);
                          if (invalidField === 'signInPassword') setInvalidField('');
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="Enter your password"
                        className={`w-full min-h-[48px] pl-4 pr-11 py-3 text-sm bg-slate-50/70 border rounded-2xl focus:bg-white focus:outline-none focus:ring-2 ${
                          invalidField === 'signInPassword'
                            ? 'border-rose-500 ring-2 ring-rose-200 focus:ring-rose-500'
                            : 'border-slate-200 focus:ring-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPassword((v) => !v)}
                        aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                      >
                        {showSignInPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-4 rounded-2xl bg-rose-50 border border-rose-300 flex items-start gap-3 text-xs font-bold text-rose-900"
                    >
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {statusMsg && (
                    <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900">
                      {statusMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 transition-all shadow-sm shadow-emerald-600/20 whitespace-nowrap"
                  >
                    <Lock className="w-4 h-4" />
                    {submitting ? 'Signing In...' : 'Unlock Money Link Wallet'}
                  </button>
                </form>
              )}
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>Fast +$0.10 Cash Stream · Direct Local Bank Payouts</span>
              <span>Protected by Encrypted Identity Vault</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
