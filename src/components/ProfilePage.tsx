import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, LogOut, Save, ShieldCheck, Smartphone } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { revokeConnectedDevice } from '../services/ledgerService';
import { ConnectedDevice, UserAccount, UserPrivateVault } from '../types';
import {
  formatDurationSeconds,
  formatUsdMicros,
  sha256Hex,
  validateContactInput,
} from '../utils/validation';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface ProfilePageProps {
  account: UserAccount;
  vault: UserPrivateVault | null;
  devices: ConnectedDevice[];
  onSignOut: () => Promise<void>;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  account,
  vault,
  devices,
  onSignOut,
}) => {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [contactInput, setContactInput] = useState(vault?.contactValue || '');
  const [newPassword, setNewPassword] = useState('');

  const [savingName, setSavingName] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setDisplayName(account.displayName);
  }, [account.displayName]);

  useEffect(() => {
    if (vault?.contactValue) {
      setContactInput((prev) => (prev ? prev : vault.contactValue));
    }
  }, [vault?.contactValue]);

  const initials = account.displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const idTypeLabel =
    account.idType === 'drivers_license'
      ? "US Driver's License"
      : account.idType === 'state_id'
        ? 'US State ID Card'
        : 'US Passport Card';

  const handleSaveName = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFeedback('');
    setErrorMsg('');
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setErrorMsg('Legal name must be between 2 and 80 characters.');
      return;
    }

    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', account.uid), {
        displayName: trimmed,
        updatedAt: serverTimestamp(),
      });
      setFeedback('Legal display name saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${account.uid}`);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!vault) return;
    setFeedback('');
    setErrorMsg('');

    const check = validateContactInput(contactInput);
    if (!check.valid) {
      setErrorMsg(check.error || 'Enter a valid Gmail address or phone number.');
      return;
    }

    let passwordHash = vault.passwordHash;
    if (newPassword.length > 0) {
      if (newPassword.length < 6) {
        setErrorMsg('New password must be at least 6 characters.');
        return;
      }
      passwordHash = await sha256Hex(newPassword);
    }

    setSavingSecurity(true);
    try {
      await updateDoc(doc(db, 'users', account.uid, 'private', 'vault'), {
        contactType: check.type,
        contactValue: check.normalized,
        passwordHash,
        updatedAt: serverTimestamp(),
      });
      setNewPassword('');
      setContactInput(check.normalized);
      setFeedback('Contact details and wallet password updated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${account.uid}/private/vault`);
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleRevoke = async (devId: string): Promise<void> => {
    setErrorMsg('');
    try {
      await revokeConnectedDevice(account.uid, devId);
      setFeedback('Phone node access removed.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to revoke device.');
    }
  };

  return (
    <div className="space-y-7">
      {/* Profile Header Card */}
      <section className="rounded-[30px] bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] text-white p-6 sm:p-8 shadow-xl shadow-slate-900/12 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-[18px] bg-white/20 backdrop-blur-md text-white font-extrabold text-xl flex items-center justify-center border border-white/20 shadow-sm">
              {initials || 'ML'}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5">
              <MoneyLinkLogo size="sm" className="scale-75 origin-bottom-right" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold truncate">{account.displayName}</h1>
            <p className="text-xs text-sky-100/90 mt-1">
              USA ID {account.usaIdMasked} · State {account.issuingState} · {idTypeLabel}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-white/15 hover:bg-white/25 active:scale-[0.98] rounded-2xl transition-all whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </section>

      {feedback && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs font-bold text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Verified USA Identity Card */}
        <section className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-[0_8px_30px_rgb(15,23,42,0.04)] flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Verified USA ID Record</h2>
                <p className="text-xs text-slate-500">Encrypted KYC compliance card</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                Verified
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Masked ID Code</dt>
                <dd className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                  {account.usaIdMasked}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">US Jurisdiction</dt>
                <dd className="font-bold text-slate-900 mt-0.5">USA · {account.issuingState}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">ID Expiry</dt>
                <dd className="font-mono tabular-nums text-slate-800 mt-0.5">
                  {vault?.idExpiryDate || 'Verified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Lifetime Earned</dt>
                <dd className="font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
                  {formatUsdMicros(account.lifetimeEarnedMicros, 2)}
                </dd>
              </div>
            </dl>
          </div>

          <form noValidate onSubmit={handleSaveName} className="pt-4 border-t border-slate-100 space-y-2.5">
            <label htmlFor="profile-name" className="block text-xs font-bold text-slate-700">
              Legal Name on Account
            </label>
            <div className="flex items-center gap-2.5">
              <input
                id="profile-name"
                type="text"
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1 min-h-[46px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={savingName}
                className="min-h-[46px] inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 rounded-2xl whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                {savingName ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </section>

        {/* Contact & Password Vault Card */}
        <section className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-5">
          <form noValidate onSubmit={handleSaveSecurity} className="space-y-4">
            <div className="border-b border-slate-100 pb-3.5">
              <h2 className="text-base font-extrabold text-slate-900">Contact &amp; Password</h2>
              <p className="text-xs text-slate-500 truncate">
                Google Security Bind: {vault?.authEmail || 'Verified'}
              </p>
            </div>

            <div>
              <label
                htmlFor="profile-contact"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Gmail or Mobile Phone Number
              </label>
              <input
                id="profile-contact"
                type="text"
                maxLength={120}
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="profile-new-pw"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Change Wallet Password (optional)
              </label>
              <input
                id="profile-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={savingSecurity || !vault}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-extrabold text-white bg-[#0A84FF] hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50 rounded-2xl transition-all shadow-sm shadow-blue-500/20"
            >
              <Save className="w-3.5 h-3.5" />
              {savingSecurity ? 'Updating...' : 'Update Contact & Password'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between gap-2">
            <span>Total Uptime: {formatDurationSeconds(account.totalOnlineSeconds)}</span>
            <span>
              Joined{' '}
              {account.createdAt ? account.createdAt.toDate().toLocaleDateString() : 'Verified'}
            </span>
          </div>
        </section>
      </div>

      {/* Paired Phones Registry */}
      <section className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900">Paired Phones History</h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {devices.length} registered
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No phones paired yet. Connect on your Home screen to link your device.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {devices.map((d) => (
              <div
                key={d.deviceId}
                className="px-5 py-3.5 min-h-[60px] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{d.deviceName}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
                      {d.pairingCode} · <span className="capitalize">{d.status}</span> ·{' '}
                      {formatDurationSeconds(d.sessionSeconds)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-extrabold font-mono tabular-nums text-emerald-700">
                    {formatUsdMicros(d.sessionEarnedMicros, 2)}
                  </span>
                  {d.status !== 'revoked' ? (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(d.deviceId)}
                      className="min-h-[38px] px-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Revoked</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
