import React, { useEffect, useState } from 'react';
import { AIAssistant } from './components/AIAssistant';
import { PredictiveTab } from './components/PredictiveTab';
import { UserProfile } from './components/UserProfile';
import { Dashboard } from './components/Dashboard';
import { VolunteerInvitations } from './components/VolunteerInvitations';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Brain, HandHelping, LayoutDashboard, LogOut, Mail, MessageSquare, ShieldAlert, User } from 'lucide-react';
import { auth, db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { respondToInvitation } from './lib/matching';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type TabKey = 'dashboard' | 'assistant' | 'predictive' | 'profile' | 'invitations';

const baseNavItems: { key: Exclude<TabKey, 'invitations'>; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'assistant', label: 'Raise Request', icon: MessageSquare },
  { key: 'predictive', label: 'Predictive', icon: Brain },
  { key: 'profile', label: 'Profile', icon: User },
];

class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Something went wrong while rendering this screen.' };
  }

  componentDidCatch(error: Error) {
    console.error('Screen render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[2rem] border border-[#d9e8ef] bg-white/90 p-8 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-500">Render issue detected</p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-slate-900">This screen failed to load</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            The app shell is live, but the selected page crashed while rendering. Go back to Home and I&apos;ll keep isolating the problem.
          </p>
          <p className="mt-4 rounded-2xl bg-[#f8fbfd] px-4 py-3 font-mono text-xs text-slate-500">{this.state.message}</p>
          <Button className="mt-6 rounded-full bg-slate-900 text-white hover:bg-slate-800" onClick={this.props.onReset}>
            Back to Home
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [focusVolunteerSetup, setFocusVolunteerSetup] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const volunteerDoc = await getDoc(doc(db, 'volunteers', nextUser.uid));
        setIsVolunteer(volunteerDoc.exists());
      } else {
        setIsVolunteer(false);
      }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const acceptId = urlParams.get('accept');
    const rejectId = urlParams.get('reject');

    if (acceptId || rejectId) {
      const handleDeepLink = async () => {
        const invitationId = acceptId || rejectId;
        const status = acceptId ? 'accepted' : 'rejected';
        if (!invitationId) return;

        try {
          await respondToInvitation(invitationId, status);
          toast.success(status === 'accepted' ? 'Mission accepted via link!' : 'Mission declined via link.');
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Deep link error:', error);
          toast.error('Failed to process invitation link');
        }
      };

      handleDeepLink();
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isVolunteer && activeTab === 'invitations') {
      setActiveTab('dashboard');
    }
  }, [isVolunteer, activeTab]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setShowProfileMenu(false);
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to sign out');
    }
  };

  const openVolunteerSetup = () => {
    setActiveTab('profile');
    setFocusVolunteerSetup(true);
    setShowProfileMenu(false);
  };

  const navItems = isVolunteer
    ? [...baseNavItems, { key: 'invitations' as const, label: 'Invitations', icon: Mail }]
    : baseNavItems;

  return (
    <div className="min-h-screen text-slate-900">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-5rem] h-[24rem] w-[24rem] rounded-full bg-[#d9f1e9] blur-3xl opacity-80" />
        <div className="absolute right-[-8rem] top-24 h-[30rem] w-[30rem] rounded-full bg-[#d7ecfb] blur-3xl opacity-90" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-[#edf9f2] blur-3xl opacity-90" />
      </div>

      <header className="relative z-20 border-b border-white/50 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 self-start rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-sm"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8bd4c2] to-[#6eaed0] text-white">
              <HandHelping className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-heading text-lg font-extrabold tracking-tight text-slate-900">HelpingHands</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Relief network</p>
            </div>
          </button>

          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.key}
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab(item.key)}
                  className={`rounded-full border px-4 ${
                    activeTab === item.key
                      ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                      : 'border-white/70 bg-white/80 text-slate-700 hover:bg-white'
                  }`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {isAdminAuthenticated && (
              <Badge className="rounded-full border border-[#cbe7df] bg-[#e9faf4] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#216255]">
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                Admin
              </Badge>
            )}
            {user && !isVolunteer && (
              <Button
                type="button"
                onClick={openVolunteerSetup}
                className="rounded-full bg-[#40765e] px-4 text-white hover:bg-[#36664f]"
              >
                Become a Volunteer
              </Button>
            )}
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProfileMenu((prev) => !prev)}
                  className="flex items-center gap-3 rounded-full border border-white/70 bg-white/85 px-2 py-1.5 shadow-sm transition hover:bg-white"
                >
                  <Avatar className="h-10 w-10 border border-[#d9e8ef]">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback className="bg-[#e8f3ff] font-bold text-[#4d84a7]">
                      {user.displayName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <p className="text-sm font-bold text-slate-900">
                      Hi, {user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                      {isVolunteer ? 'Volunteer' : 'Signed in'}
                    </p>
                  </div>
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-44 rounded-[1.4rem] border border-white/80 bg-white/95 p-2 shadow-xl backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('profile');
                        setFocusVolunteerSetup(false);
                        setShowProfileMenu(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-[#f4f9fb]"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Badge className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-600">
                Guest
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <ScreenErrorBoundary onReset={() => setActiveTab('dashboard')}>
          {activeTab === 'dashboard' && (
            <Dashboard
              isAdmin={isAdminAuthenticated}
              isVolunteer={isVolunteer}
              onNavigate={(tab) => setActiveTab(tab as TabKey)}
            />
          )}
          {activeTab === 'assistant' && <AIAssistant />}
          {activeTab === 'predictive' && <PredictiveTab />}
          {activeTab === 'invitations' && isVolunteer && <VolunteerInvitations />}
          {activeTab === 'profile' && (
            <UserProfile
              focusVolunteerSetup={focusVolunteerSetup}
              onFocusVolunteerSetupHandled={() => setFocusVolunteerSetup(false)}
            />
          )}
        </ScreenErrorBoundary>
      </main>

      <Toaster position="top-center" richColors />
    </div>
  );
}
