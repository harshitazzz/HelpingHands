import React, { useState, useEffect } from 'react';
import { Chatbot } from './components/Chatbot';
import { ReportUpload } from './components/ReportUpload';
import { UserProfile } from './components/UserProfile';
import { VolunteerInvitations } from './components/VolunteerInvitations';
import { AdminPanel } from './components/AdminPanel';
import { respondToInvitation } from './lib/matching';
import { Dashboard } from './components/Dashboard';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Shield, Users, AlertTriangle, MessageSquare, FileUp, UserPlus, LayoutDashboard, LogOut, MailCheck, ShieldAlert, Trash2 } from 'lucide-react';
import { 
  auth, 
  db,
  signInWithGoogle, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from './lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';
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
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Email/Password sign-in is not enabled in Firebase. Please contact the administrator.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('Password is too weak. Please use at least 6 characters.');
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('This email is already registered. Please try logging in instead.');
      } else {
        toast.error(error.message || 'Authentication failed');
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
      } else {
        console.error('Login error:', error);
        toast.error('Failed to sign in with Google');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg shadow-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-primary">Beacon</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAdminAuthenticated && (
              <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1 py-1 px-3">
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
                  <p className="text-sm font-bold">Hi, {user.displayName || 'User'}</p>
                </div>
                <Avatar className="w-9 h-9 border-2 border-primary/20">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {user.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Button onClick={() => setShowLoginModal(true)} className="rounded-full">
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="chat" className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight">Emergency Command Center</h1>
              <p className="text-muted-foreground">AI-powered coordination for crisis response.</p>
            </div>
            <TabsList className={`grid w-full md:w-auto h-auto p-1 bg-slate-100 ${isVolunteer ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
              <TabsTrigger value="chat" className="flex items-center gap-2 py-2">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">AI Chat</span>
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2 py-2">
                <FileUp className="w-4 h-4" />
                <span className="hidden sm:inline">NGO Report</span>
              </TabsTrigger>
              {isVolunteer && (
                <TabsTrigger value="invitations" className="flex items-center gap-2 py-2">
                  <MailCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Invitations</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="dashboard" className="flex items-center gap-2 py-2">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center gap-2 py-2">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Content Area */}
            <div className="lg:col-span-8">
              <TabsContent value="chat" className="mt-0">
                <Chatbot />
              </TabsContent>
              <TabsContent value="upload" className="mt-0">
                <ReportUpload />
              </TabsContent>
              {isVolunteer && (
                <TabsContent value="invitations" className="mt-0">
                  <VolunteerInvitations />
                </TabsContent>
              )}
              <TabsContent value="dashboard" className="mt-0">
                {isAdminAuthenticated ? <AdminPanel /> : <Dashboard isAdmin={isAdminAuthenticated} />}
              </TabsContent>
              <TabsContent value="profile" className="mt-0">
                <UserProfile />
              </TabsContent>
            </div>

            {/* Sidebar Stats / Info */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-primary text-primary-foreground overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Heart className="w-24 h-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">Impact Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-3xl font-bold">1,284</p>
                      <p className="text-xs opacity-80">Lives Impacted</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">52</p>
                      <p className="text-xs opacity-80">Active Missions</p>
                    </div>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white w-[75%]" />
                  </div>
                  <p className="text-[10px] italic opacity-70">75% of requests fulfilled within 2 hours.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Quick Tips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg h-fit">
                      <AlertTriangle className="w-4 h-4 text-blue-600" />
                    </div>
                    <p>Be specific about the <strong>location</strong> and <strong>type of help</strong> needed when chatting with Beacon.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-green-50 p-2 rounded-lg h-fit">
                      <Users className="w-4 h-4 text-green-600" />
                    </div>
                    <p>Volunteers with <strong>Medical</strong> and <strong>Logistics</strong> skills are currently in high demand.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs>
      </main>

      <Toaster position="top-center" />

      {/* Unified Login Dialog */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-8 text-white text-center relative">
            <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              {loginMode === 'signup' ? 'Create Account' : loginMode === 'admin' ? 'System Access' : 'Welcome to Beacon'}
            </h2>
            <p className="text-white/70 text-sm mt-1">
              {loginMode === 'signup' ? 'Join the mission today.' : loginMode === 'admin' ? 'Restricted administrative area.' : 'Sign in to join the mission.'}
            </p>
          </div>
          
          <div className="p-8 space-y-6 bg-white">
            {loginMode !== 'admin' && (
              <Button 
                variant="outline" 
                className="w-full h-12 font-bold text-slate-700 border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-3"
                onClick={handleGoogleLogin}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">
                  {loginMode === 'admin' ? 'Admin Login' : 'Email Access'}
                </span>
              </div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {loginMode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="johndoe" 
                      className="bg-slate-50 border-none focus-visible:ring-primary h-11 pl-10"
                      value={authCreds.username}
                      onChange={e => setAuthCreds(prev => ({ ...prev, username: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="email" 
                    placeholder="name@example.com" 
                    className="bg-slate-50 border-none focus-visible:ring-primary h-11 pl-10"
                    value={authCreds.email}
                    onChange={e => setAuthCreds(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="bg-slate-50 border-none focus-visible:ring-primary h-11 pl-10"
                    value={authCreds.password}
                    onChange={e => setAuthCreds(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 font-bold shadow-lg shadow-primary/20">
                {loginMode === 'signup' ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="flex flex-col gap-2 pt-2">
              {loginMode === 'login' && (
                <>
                  <button 
                    onClick={() => setLoginMode('signup')}
                    className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    Don't have an account? <span className="font-bold">Sign Up</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => setLoginMode('admin')}
                    className="text-[10px] text-slate-400 hover:text-slate-600 uppercase tracking-widest font-bold mt-4"
                  >
                    System Administrator Access
                  </button>
                </>
              )}
              {loginMode === 'signup' && (
                <button 
                  onClick={() => setLoginMode('login')}
                  className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-1"
                >
                  Already have an account? <span className="font-bold">Login</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
              {loginMode === 'admin' && (
                <button 
                  onClick={() => setLoginMode('login')}
                  className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center justify-center gap-1"
                >
                  Back to <span className="font-bold">Standard Login</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
