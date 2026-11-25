'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Mail, Phone, UserRound, X } from 'lucide-react'
import { ThemeToggle } from '@/components/app/theme-toggle'
import { signOut } from 'next-auth/react'
import { EmailCheckHint, useEmailCheck } from '@/components/app/email-check-hint'
import { EmailNotificationsSection, ReceiptsSection } from '@/components/app/settings-email'

type Account = {
  role: string
  emailOffers: boolean
  emailSales: boolean
  username: string
  email: string
  pendingEmail: string | null
  emailVerified: boolean
  phone: string | null
  phoneVerified: boolean
  passwordChangedAt: string | null
  phoneEnabled: boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never changed'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso)
  )
}

/** Account Settings — opened from the header gear icon. */
export function SettingsView({
  onClose,
  focusSection,
}: {
  onClose: () => void
  /** section id to scroll to once loaded (email deep link: email-notifications) */
  focusSection?: string | null
}) {
  const [account, setAccount] = useState<Account | null>(null)
  const emailCheck = useEmailCheck()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState('')

  // username
  const [username, setUsername] = useState('')

  // change email
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')

  // change password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // phone
  const [phone, setPhone] = useState('')
  const [phonePassword, setPhonePassword] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneStage, setPhoneStage] = useState<'idle' | 'code'>('idle')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [phoneRemovePassword, setPhoneRemovePassword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/account')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load account')
      setAccount(data)
      setUsername(data.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // deep link from an email footer: scroll once the sections have rendered
  const accountLoaded = account !== null
  useEffect(() => {
    if (!accountLoaded || !focusSection) return
    document.getElementById(focusSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [accountLoaded, focusSection])

  const call = async (path: string, method: string, body: unknown, successMessage?: string) => {
    setBusy(path)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/account${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      await load()
      if (successMessage) setInfo(successMessage)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      return null
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Account</p>
        <button onClick={onClose} aria-label="Close settings" className="text-muted-foreground hover:text-foreground">
          <X size={20} />
        </button>
      </div>
      <h1 className="mt-2 text-4xl font-black">Settings</h1>

      {(() => {
        // the account fetch resolves in an effect below — never dereference
        // the null initial state (loading spinner, then a retry on failure)
        if (!account) {
          if (loading) {
            return (
              <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={16} /> Loading settings…
              </p>
            )
          }
          return (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-error">{error || 'Failed to load account'}</p>
              <button
                onClick={() => void load()}
                className="mt-3 rounded-xl bg-surface-2 px-4 py-2 text-xs font-black"
              >
                Try again
              </button>
            </div>
          )
        }
        const acct: Account = account
        return (
      <div>
      {error && <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-bold text-error">{error}</p>}
      {info && <p className="mt-4 rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-bold text-success">{info}</p>}

      {/* ---- account ---- */}
      <section className="mt-8 rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <UserRound size={16} className="text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Account</h2>
        </div>

        <label className="mt-4 block text-xs font-bold text-muted-foreground">
          Username
          <div className="mt-2 flex gap-2">
            <input
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              className="input"
              aria-label="Username"
            />
            <button
              onClick={() => void call('/username', 'PATCH', { username }, 'Username saved.')}
              disabled={busy !== '' || username === acct.username}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
            >
              {busy === '/username' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
          </div>
        </label>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mail size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold">{acct.email}</span>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
              acct.emailVerified ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
            }`}
          >
            {acct.emailVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        {acct.pendingEmail && (
          <p className="mt-1 text-xs font-semibold text-warning">Pending: {acct.pendingEmail}</p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Phone size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold">
              {acct.phone ?? 'No phone added'}
            </span>
          </div>
          {acct.phone && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                acct.phoneVerified ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              }`}
            >
              {acct.phoneVerified ? 'Verified' : 'Unverified'}
            </span>
          )}
        </div>
      </section>

      {/* ---- change email ---- */}
      <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Change email</h2>
        </div>
        {acct.pendingEmail && (
          <p className="mt-2 text-xs font-semibold text-warning">Pending: {acct.pendingEmail}</p>
        )}
        <input
          type="email"
          value={newEmail}
          onChange={e => {
            setNewEmail(e.target.value)
            emailCheck.clear()
          }}
          onBlur={() => void emailCheck.check(newEmail)}
          className="input mt-3"
          placeholder="New email"
          aria-label="New email"
        />
        <EmailCheckHint
          hint={emailCheck.hint}
          className="mt-1.5"
          onUseSuggestion={suggestion => {
            setNewEmail(suggestion)
            emailCheck.clear()
          }}
        />
        <input
          type="password"
          value={emailPassword}
          onChange={e => setEmailPassword(e.target.value)}
          className="input mt-2"
          placeholder="Current password"
          aria-label="Current password for email change"
        />
        <button
          onClick={() => void call('/change-email', 'POST', { newEmail, currentPassword: emailPassword }, 'Confirmation link sent.').then(() => setEmailPassword(''))}
          disabled={busy !== '' || !newEmail.includes('@') || !emailPassword || emailCheck.hint?.ok === false}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
        >
          {busy === '/change-email' ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Send confirmation to new email'}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The email switches only after the link in the new inbox is clicked.
        </p>
      </section>

      {/* ---- password ---- */}
      <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Password</h2>
          <span className="text-xs text-muted-foreground">
            •••••••• · Last changed {fmtDate(acct.passwordChangedAt)}
          </span>
        </div>
        <input
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          className="input mt-3"
          placeholder="Current password"
          aria-label="Current password"
        />
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="input mt-2"
          placeholder="New password (8+ characters)"
          aria-label="New password"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="input mt-2"
          placeholder="Confirm new password"
          aria-label="Confirm new password"
        />
        {newPassword && confirmPassword && newPassword !== confirmPassword && (
          <p className="mt-2 text-xs font-semibold text-error">Passwords do not match</p>
        )}
        <button
          onClick={() =>
            void call('/change-password', 'POST', { currentPassword, newPassword }, 'Password changed.').then(() => {
              setCurrentPassword('')
              setNewPassword('')
              setConfirmPassword('')
            })
          }
          disabled={busy !== '' || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
        >
          {busy === '/change-password' ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Change password'}
        </button>
      </section>

      {/* ---- phone ---- */}
      {acct.phoneEnabled && (
        <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-brand" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Phone</h2>
          </div>

          {phoneStage === 'code' ? (
            <>
              <input
                value={phoneCode}
                onChange={e => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                className="input mt-3"
                placeholder="6-digit code"
                aria-label="Phone verification code"
                inputMode="numeric"
                maxLength={6}
              />
              {devCode && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Dev mode — verification code: <b>{devCode}</b>
                </p>
              )}
              <button
                onClick={() =>
                  void call('/phone/verify', 'POST', { code: phoneCode }, 'Phone verified.').then(() =>
                    setPhoneStage('idle')
                  )
                }
                disabled={busy !== '' || phoneCode.length !== 6}
                className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
              >
                {busy === '/phone/verify' ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Verify phone'}
              </button>
            </>
          ) : (
            <>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="input mt-3"
                placeholder={acct.phone ?? '+14045551234'}
                aria-label="Phone number"
              />
              <input
                type="password"
                value={phonePassword}
                onChange={e => setPhonePassword(e.target.value)}
                className="input mt-2"
                placeholder="Current password"
                aria-label="Current password for phone change"
              />
              <button
                onClick={() =>
                  void call('/phone', 'POST', { phone, currentPassword: phonePassword }, 'Code sent.').then(data => {
                    if (data?.devCode) setDevCode(data.devCode)
                    setPhoneStage('code')
                    setPhonePassword('')
                  })
                }
                disabled={busy !== '' || !phone || !phonePassword}
                className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
              >
                {acct.phone ? 'Change phone number' : 'Add phone number'}
              </button>
            </>
          )}
          {acct.phone && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="password"
                value={phoneRemovePassword}
                onChange={e => setPhoneRemovePassword(e.target.value)}
                className="input"
                placeholder="Current password to remove phone"
                aria-label="Current password to remove phone"
              />
              <button
                onClick={() =>
                  void call('/phone', 'DELETE', { currentPassword: phoneRemovePassword }, 'Phone removed.').then(() =>
                    setPhoneRemovePassword('')
                  )
                }
                disabled={busy !== '' || !phoneRemovePassword}
                className="shrink-0 rounded-xl border border-error/40 px-3 py-2.5 text-xs font-black text-error hover:bg-error/10 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---- email notifications + receipts / sales (Prompt 15) ---- */}
      <EmailNotificationsSection
        role={acct.role}
        emailOffers={acct.emailOffers}
        emailSales={acct.emailSales}
        onSaved={prefs => setAccount(current => (current ? { ...current, ...prefs } : current))}
      />
      <ReceiptsSection />

      {/* ---- appearance ---- */}
      <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Appearance</h2>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </section>

      {/* ---- legal ---- */}
      <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Legal</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
          <Link href="/terms" className="text-foreground underline underline-offset-2">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
        </div>
      </section>

      <button
        onClick={() => void signOut({ callbackUrl: '/login' })}
        className="mt-8 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-black hover:bg-surface-2"
      >
        Sign out
      </button>
      </div>
        );
      })()}
    </div>
  )
}

