import React, { useState, useEffect, useCallback } from 'react';
import { Fingerprint, KeyRound, ArrowLeft, RefreshCw, Users } from 'lucide-react';
import { useStore } from '../../store';

// ─── User Picker ──────────────────────────────────────────────────────────────
function UserPicker({ users, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 20 }}>
      {users.map(u => (
        <button
          key={u.id}
          className="user-picker-btn"
          onClick={() => onSelect(u.id)}
        >
          <div className="user-picker-avatar" style={{ background: u.color }}>{u.initials}</div>
          <div className="user-picker-info">
            <div className="user-picker-name">{u.name}</div>
            <div className="user-picker-role">{u.role === 'admin' ? 'Administrator' : 'Family Member'}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── PIN keypad ───────────────────────────────────────────────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
function PinKeypad({ onKey, disabled }) {
  return (
    <div className="pin-keypad">
      {KEYS.map((k, i) => (
        <button
          key={i}
          className={`pin-key ${k === '⌫' ? 'del' : ''} ${k === '' ? 'empty' : ''}`}
          onClick={() => k !== '' && onKey(k)}
          disabled={disabled || k === ''}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

// ─── Dot row ──────────────────────────────────────────────────────────────────
function PinDots({ filled, status }) {
  return (
    <div className="pin-dots">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`pin-dot ${i < filled ? (status === 'error' ? 'error' : 'filled') : ''}`} />
      ))}
    </div>
  );
}

// ─── Touch ID button ──────────────────────────────────────────────────────────
function TouchIdButton({ status, onClick, disabled }) {
  const color = {
    idle:     'var(--text-muted)',
    scanning: 'var(--accent-blue)',
    success:  'var(--accent-green)',
    error:    'var(--accent-red)',
  }[status] ?? 'var(--text-muted)';
  
  const ringClass = { idle: '', scanning: 'scanning', success: 'success', error: 'error' }[status] ?? '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`biometric-ring ${ringClass}`}
      title="Authenticate with Touch ID"
      style={{
        background: 'none', border: `2px solid ${color}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Fingerprint size={38} color={color} strokeWidth={1.4} style={{ transition: 'color 0.2s' }} />
    </button>
  );
}

// ─── Main AuthScreen ──────────────────────────────────────────────────────────
export default function AuthScreen() {
  const {
    authMode, setAuthMode, isFirstRun, touchIdAvailable,
    registerTouchId, verifyTouchId,
    verifyPin, setPin, authError,
    users, activeUser, selectUser, deselectUser, family
  } = useStore();

  const [pin, setLocalPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState('enter');
  const [touchStatus, setTouchStatus] = useState('idle');
  const [hint, setHint] = useState('');

  // Update hint based on mode
  useEffect(() => {
    if (authMode === 'touchid') {
      setHint(isFirstRun ? 'Press the fingerprint icon to enroll Touch ID' : 'Press the fingerprint icon to unlock');
    } else if (authMode === 'pin') {
      setHint(isFirstRun ? (pinStep === 'confirm' ? 'Confirm your PIN' : 'Set a 6-digit PIN') : 'Enter your PIN to unlock');
    }
  }, [authMode, isFirstRun, pinStep]);

  // Touch ID flow
  const handleTouchId = useCallback(async () => {
    setTouchStatus('scanning');
    setHint(isFirstRun ? 'Enrolling Touch ID…' : 'Touch the fingerprint sensor…');

    const result = isFirstRun ? await registerTouchId() : await verifyTouchId();
    if (result.success) {
      setTouchStatus('success');
      setHint('✓ Access granted');
    } else {
      setTouchStatus('error');
      setHint(result.error || 'Authentication failed — try again');
      setTimeout(() => setTouchStatus('idle'), 1400);
    }
  }, [isFirstRun, registerTouchId, verifyTouchId]);

  // Auto-trigger Touch ID if returning user
  useEffect(() => {
    if (authMode === 'touchid' && !isFirstRun && touchStatus === 'idle') {
      const t = setTimeout(handleTouchId, 600);
      return () => clearTimeout(t);
    }
  }, [authMode, isFirstRun]);

  // PIN flow
  const currentPin = pinStep === 'confirm' ? confirmPin : pin;
  async function handlePinKey(k) {
    if (k === '⌫') {
      pinStep === 'confirm' ? setConfirmPin(p => p.slice(0, -1)) : setLocalPin(p => p.slice(0, -1));
      return;
    }
    const next = currentPin + k;
    if (next.length > 6) return;
    
    pinStep === 'confirm' ? setConfirmPin(next) : setLocalPin(next);

    if (next.length === 6) {
      if (isFirstRun) {
        if (pinStep === 'enter') {
          setPinStep('confirm');
        } else {
          if (next === pin) await setPin(pin);
          else {
            setHint("PINs don't match — start over");
            setTimeout(() => { setLocalPin(''); setConfirmPin(''); setPinStep('enter'); }, 1200);
          }
        }
      } else {
        const ok = await verifyPin(next);
        if (!ok) setTimeout(() => { setLocalPin(''); }, 600);
      }
    }
  }

  // Keyboard support for PIN entry
  useEffect(() => {
    if (authMode !== 'pin') return;
    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') handlePinKey(e.key);
      if (e.key === 'Backspace' || e.key === 'Delete') handlePinKey('⌫');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authMode, pinStep, currentPin, pin]);

  return (
    <div className="auth-bg">
      <div className="auth-card">
        {/* Back button if user is selected */}
        {activeUser && (
          <button onClick={deselectUser} className="auth-back-btn">
            <ArrowLeft size={16} /> Back
          </button>
        )}

        <div className="auth-logo-wrap">⚡</div>
        <h1 className="auth-title">Gordan Belfort</h1>
        
        {authMode === 'picker' ? (
          <>
            <p className="auth-subtitle">{family?.name} — Select Account</p>
            <UserPicker users={users} onSelect={selectUser} />
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              {activeUser?.name} • {authMode === 'touchid' && isFirstRun ? 'Enroll Touch ID' : authMode === 'touchid' ? 'Biometric Login' : isFirstRun ? 'Create PIN' : 'Enter PIN'}
            </p>

            {authMode === 'touchid' && (
              <>
                <TouchIdButton status={touchStatus} onClick={handleTouchId} disabled={touchStatus === 'scanning' || touchStatus === 'success'} />
                <p className="auth-touch-hint" style={{ color: touchStatus === 'error' ? 'var(--accent-red)' : touchStatus === 'success' ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {hint}
                </p>
                <button onClick={() => setAuthMode('pin')} className="auth-switch-btn"><KeyRound size={13} /> Use PIN instead</button>
              </>
            )}

            {authMode === 'pin' && (
              <>
                <PinDots filled={currentPin.length} status={authError ? 'error' : 'idle'} />
                <PinKeypad onKey={handlePinKey} disabled={false} />
                <p className="auth-hint">{hint}</p>
                {touchIdAvailable && (
                  <button onClick={() => { setAuthMode('touchid'); setLocalPin(''); setConfirmPin(''); }} className="auth-switch-btn" style={{marginTop: 12}}>
                    <Fingerprint size={13} /> Use Touch ID instead
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
