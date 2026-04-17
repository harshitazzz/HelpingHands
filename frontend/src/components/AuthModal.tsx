import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  HandHelping, Mail, Lock, User, Eye, EyeOff,
  Loader2, X, AlertCircle, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  auth,
  signInWithGoogle,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from '@/src/lib/firebase';
import { toast } from 'sonner';

interface AuthModalProps {
  onClose: () => void;
}

type Mode = 'signin' | 'signup';

export function AuthModal({ onClose }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const clearError = () => setError('');

  const friendlyError = (code: string) => {
    const map: Record<string, string> = {
      'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must be at least 6 characters long.',
      'auth/user-not-found': 'No account found with this email. Please sign up first.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/popup-closed-by-user': '',
    };
    return map[code] || 'Something went wrong. Please try again.';
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    clearError();
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google!');
      onClose();
    } catch (e: any) {
      const msg = friendlyError(e.code);
      if (msg) setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) { setError('Please enter your name.'); setIsLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: displayName.trim() });
        toast.success(`Welcome to HelpingHands, ${displayName.split(' ')[0]}!`);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Welcome back!');
      }
      onClose();
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    clearError();
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Blurred overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[2.4rem] border border-white/80 bg-white shadow-[0_32px_80px_rgba(100,140,165,0.22)]"
      >
        {/* Decorative gradient header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#7fc9e4] via-[#6bb8d6] to-[#8fd2c8] px-8 pt-8 pb-12">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <button
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <HandHelping className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-heading text-lg font-extrabold tracking-tight text-white">HelpingHands</p>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/60">Relief network</p>
            </div>
          </div>

          <div className="relative mt-6">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-white">
              {mode === 'signin' ? 'Welcome back' : 'Join us'}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">
              {mode === 'signin'
                ? 'Sign in to coordinate help and raise requests.'
                : 'Create an account to start making a difference.'}
            </p>
          </div>
        </div>

        {/* Card body — overlaps header slightly */}
        <div className="-mt-6 rounded-[2rem] bg-white px-8 pb-8 pt-7">
          {/* Tab switcher */}
          <div className="mb-6 flex rounded-full bg-[#f3f8fb] p-1">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearError(); }}
                className={`flex-1 rounded-full py-2.5 text-sm font-bold transition ${
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Google button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={isLoading}
            className="flex h-14 w-full items-center gap-3 rounded-2xl border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            {/* Google SVG */}
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">or with email</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                    <Input
                      placeholder="Your full name"
                      value={displayName}
                      onChange={(e) => { setDisplayName(e.target.value); clearError(); }}
                      className="h-14 rounded-2xl border-slate-200 bg-[#f8fbfd] pl-11 font-medium text-slate-800 placeholder:text-slate-300 focus-visible:ring-[#6bb8d6]"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                required
                className="h-14 rounded-2xl border-slate-200 bg-[#f8fbfd] pl-11 font-medium text-slate-800 placeholder:text-slate-300 focus-visible:ring-[#6bb8d6]"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'signup' ? 'Create a password (min. 6 chars)' : 'Your password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                required
                className="h-14 rounded-2xl border-slate-200 bg-[#f8fbfd] pl-11 pr-12 font-medium text-slate-800 placeholder:text-slate-300 focus-visible:ring-[#6bb8d6]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <p className="text-sm font-medium text-rose-700">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={isLoading}
              className="h-14 w-full rounded-2xl bg-[#2f6d8e] text-base font-bold text-white shadow-lg shadow-blue-200/40 transition-all hover:bg-[#285f7a] active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-5 w-5" />
              )}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {/* Footer link */}
          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={switchMode}
              className="font-bold text-[#2f6d8e] underline-offset-2 hover:underline"
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
