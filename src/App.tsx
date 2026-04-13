import React, { useState, useEffect } from 'react';
import { AIAssistant } from './components/AIAssistant';
import { PredictiveTab } from './components/PredictiveTab';
import { UserProfile } from './components/UserProfile';
import { AdminPanel } from './components/AdminPanel';
import { respondToInvitation } from './lib/matching';
import { Dashboard } from './components/Dashboard';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Shield, Users, AlertTriangle, MessageSquare, FileUp, UserPlus, LayoutDashboard, LogOut, MailCheck, ShieldAlert, Trash2, Brain, HandHelping, Sparkles } from 'lucide-react';
import { 
  auth, 
  db,
  signInWithGoogle, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from './lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X, User, Lock, Mail, ChevronRight } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'signup' | 'admin'>('login');
  const [authCreds, setAuthCreds] = useState({ email: '', password: '', username: '' });
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        // Check volunteer status
        const vDoc = await getDoc(doc(db, 'volunteers', u.uid));
        setIsVolunteer(vDoc.exists());
      } else {
        setIsVolunteer(false);
      }
    });
    
    // Handle deep links for invitation responses (simulating Gmail links)
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
          toast.success(status === 'accepted' ? "Mission accepted via link!" : "Mission declined via link.");
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error("Deep link error:", error);
          toast.error("Failed to process invitation link");
        }
      };
      handleDeepLink();
    }

    return () => unsubscribe();
  }, []);

  const handleBecomeVolunteer = async () => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    try {
      await setDoc(doc(db, 'volunteers', user.uid), {
        uid: user.uid,
        name: user.displayName || 'Volunteer',
        email: user.email,
        availability: 'available',
        skills: ['General Support'],
        location: 'Global',
        createdAt: new Date()
      });
      setIsVolunteer(true);
      toast.success("Welcome to the team! You are now a volunteer.");
    } catch (error) {
      toast.error("Failed to register as volunteer");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (loginMode === 'admin') {
        if (authCreds.email === 'admin@gmail.com' && authCreds.password === 'admin123') {
          setIsAdminAuthenticated(true);
          setShowLoginModal(false);
          toast.success('Admin Dashboard Unlocked');
        } else {
          toast.error('Invalid admin credentials');
        }
        return;
      }

      if (loginMode === 'signup') {
        if (authCreds.password.length < 6) {
          toast.error('Password must be at least 6 characters long');
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, authCreds.email, authCreds.password);
        await updateProfile(userCredential.user, {
          displayName: authCreds.username
        });
        toast.success('Account created successfully!');
      } else {
        await signInWithEmailAndPassword(auth, authCreds.email, authCreds.password);
        toast.success('Signed in successfully!');
      }
      setShowLoginModal(false);
      setAuthCreds({ email: '', password: '', username: '' });
    } catch (error: any) {
      console.error('Auth error:', error);
      const errorCode = error.code || '';
      const errorMessage = error.message || '';

      if (errorCode === 'auth/operation-not-allowed') {
        toast.error('Email/Password sign-in is not enabled in Firebase. Please contact the administrator.');
      } else if (errorCode === 'auth/weak-password') {
        toast.error('Password is too weak. Please use at least 6 characters.');
      } else if (errorCode === 'auth/email-already-in-use') {
        toast.error('This email is already registered. Please try logging in instead.');
      } else if (errorCode === 'auth/invalid-email') {
        toast.error('Please enter a valid email address.');
      } else if (
        errorCode === 'auth/invalid-credential' || 
        errorCode === 'auth/user-not-found' || 
        errorCode === 'auth/wrong-password' ||
        errorMessage.toLowerCase().includes('invalid-credential')
      ) {
        toast.error('Invalid email or password. Please check your credentials and try again.');
      } else {
        toast.error(errorMessage || 'Authentication failed');
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      setShowLoginModal(false);
      toast.success('Signed in successfully');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        toast.info('Sign in cancelled');
      } else if (error.code === 'auth/operation-not-allowed') {
        toast.error('Google sign-in is not enabled in Firebase. Please contact the administrator.');
      } else if (error.message && error.message.includes('invalid-credential')) {
        toast.error('Authentication failed. Please check your account or try a different method.');
      } else {
        console.error('Login error:', error);
        toast.error('Failed to sign in with Google');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFDF7] font-sans text-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-primary p-2 rounded-2xl shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
              <HandHelping className="w-7 h-7 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter text-slate-900 leading-none">Helping Hands</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-primary mt-1">NGO Platform</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isAdminAuthenticated && (
              <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1 py-1 px-3 rounded-full">
                <ShieldAlert className="w-3 h-3" />
                Admin Mode
                <Button 
                  variant="ghost" 
                  size="icon-xs" 
                  className="ml-2 h-4 w-4 p-0 hover:bg-green-200" 
                  onClick={() => setIsAdminAuthenticated(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-black">Hi, {user.displayName || 'User'}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{isVolunteer ? 'Volunteer' : 'Supporter'}</p>
                </div>
                <Avatar className="w-10 h-10 border-2 border-primary/20 shadow-sm">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-black">
                    {user.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Button onClick={() => setShowLoginModal(true)} className="rounded-full h-11 px-8 font-bold shadow-lg shadow-primary/20">
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">AI-Powered Coordination</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
                {activeTab === 'dashboard' ? 'Community Dashboard' : 
                 activeTab === 'assistant' ? 'AI Assistant' : 
                 activeTab === 'predictive' ? 'Future Insights' : 'My Profile'}
              </h1>
            </div>
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full lg:w-auto h-auto p-1.5 bg-slate-100/50 backdrop-blur-sm rounded-3xl border border-slate-200/50">
              <TabsTrigger value="dashboard" className="flex items-center gap-2 py-3 rounded-2xl data-[state=active]:shadow-md">
                <LayoutDashboard className="w-4 h-4" />
                <span className="font-bold">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="assistant" className="flex items-center gap-2 py-3 rounded-2xl data-[state=active]:shadow-md">
                <MessageSquare className="w-4 h-4" />
                <span className="font-bold">AI Assistant</span>
              </TabsTrigger>
              <TabsTrigger value="predictive" className="flex items-center gap-2 py-3 rounded-2xl data-[state=active]:shadow-md">
                <Brain className="w-4 h-4" />
                <span className="font-bold">Predictive</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center gap-2 py-3 rounded-2xl data-[state=active]:shadow-md">
                <User className="w-4 h-4" />
                <span className="font-bold">Profile</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="grid lg:grid-cols-12 gap-12">
            {/* Main Content Area */}
            <div className="lg:col-span-8">
              <TabsContent value="dashboard" className="mt-0 focus-visible:ring-0">
                <Dashboard isAdmin={isAdminAuthenticated} />
              </TabsContent>
              <TabsContent value="assistant" className="mt-0 focus-visible:ring-0">
                <AIAssistant />
              </TabsContent>
              <TabsContent value="predictive" className="mt-0 focus-visible:ring-0">
                <PredictiveTab />
              </TabsContent>
              <TabsContent value="profile" className="mt-0 focus-visible:ring-0">
                <UserProfile />
              </TabsContent>
            </div>

            {/* Sidebar Stats / Info */}
            <div className="lg:col-span-4 space-y-8">
              {!isVolunteer && (
                <Card className="bg-gradient-to-br from-primary to-green-600 text-white border-none rounded-[2rem] shadow-xl shadow-primary/20 overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-500">
                    <Heart className="w-32 h-32" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-2xl font-black">Become a Volunteer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 relative z-10">
                    <p className="text-white/80 text-sm leading-relaxed">
                      Join our network of 500+ heroes. Get real-time alerts for emergencies where your skills can save lives.
                    </p>
                    <Button 
                      onClick={handleBecomeVolunteer}
                      className="w-full bg-white text-primary hover:bg-slate-50 h-12 rounded-2xl font-black shadow-lg"
                    >
                      Register Now
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isVolunteer && (
                <Card className="bg-slate-900 text-white border-none rounded-[2rem] shadow-xl overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-6 opacity-10">
                    <MailCheck className="w-20 h-20" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-xl font-bold">Volunteer Portal</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                      <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Invitation Bar</p>
                      <p className="text-sm text-white/70">
                        New mission requests will appear here. You can accept or decline instantly.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full border-white/20 hover:bg-white/10 text-white h-11 rounded-xl font-bold"
                      onClick={() => setActiveTab('profile')}
                    >
                      View Invitations
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-[2rem] border-none shadow-lg bg-white">
                <CardHeader>
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Impact Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-4xl font-black text-slate-900 tracking-tighter">1,284</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lives Impacted</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-primary tracking-tighter">52</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Missions</p>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[75%] rounded-full shadow-sm" />
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <AlertTriangle className="w-5 h-5 text-blue-600" />
                    <p className="text-xs text-blue-800 font-medium leading-tight">
                      <strong>Tip:</strong> Be specific about the location when reporting issues.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs>
      </main>

      <Toaster position="top-center" richColors />

      {/* Unified Login Dialog */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem]">
          <div className="bg-primary p-10 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="bg-white/20 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 backdrop-blur-md shadow-inner">
              <HandHelping className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-black tracking-tight">
              {loginMode === 'signup' ? 'Join Us' : loginMode === 'admin' ? 'System Access' : 'Welcome Back'}
            </h2>
            <p className="text-white/70 text-sm mt-2 font-medium">
              {loginMode === 'signup' ? 'Start your journey with Helping Hands.' : loginMode === 'admin' ? 'Restricted administrative area.' : 'Sign in to Helping Hands.'}
            </p>
          </div>
          
          <div className="p-10 space-y-8 bg-white">
            {loginMode !== 'admin' && (
              <Button 
                variant="outline" 
                className="w-full h-14 font-black text-slate-700 border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-3 rounded-2xl transition-all"
                onClick={handleGoogleLogin}
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.2em]">
                <span className="bg-white px-4 text-slate-300">
                  {loginMode === 'admin' ? 'Admin Login' : 'Or Email'}
                </span>
              </div>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {loginMode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <Input 
                      placeholder="johndoe" 
                      className="bg-slate-50 border-none focus-visible:ring-primary h-14 pl-12 rounded-2xl font-medium"
                      value={authCreds.username}
                      onChange={e => setAuthCreds(prev => ({ ...prev, username: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                  <Input 
                    type="email" 
                    placeholder="name@example.com" 
                    className="bg-slate-50 border-none focus-visible:ring-primary h-14 pl-12 rounded-2xl font-medium"
                    value={authCreds.email}
                    onChange={e => setAuthCreds(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="bg-slate-50 border-none focus-visible:ring-primary h-14 pl-12 rounded-2xl font-medium"
                    value={authCreds.password}
                    onChange={e => setAuthCreds(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-14 font-black shadow-xl shadow-primary/30 rounded-2xl text-lg mt-4">
                {loginMode === 'signup' ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="flex flex-col gap-4 pt-4">
              {loginMode === 'login' && (
                <>
                  <button 
                    onClick={() => setLoginMode('signup')}
                    className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    Don't have an account? <span className="font-black text-primary">Sign Up</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setLoginMode('admin')}
                    className="text-[10px] text-slate-300 hover:text-slate-500 uppercase tracking-[0.2em] font-black mt-4 transition-colors"
                  >
                    System Administrator Access
                  </button>
                </>
              )}
              {loginMode === 'signup' && (
                <button 
                  onClick={() => setLoginMode('login')}
                  className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  Already have an account? <span className="font-black text-primary">Login</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {loginMode === 'admin' && (
                <button 
                  onClick={() => setLoginMode('login')}
                  className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  Back to <span className="font-black text-primary">Standard Login</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
