import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mail, 
  MapPin, 
  Briefcase, 
  Clock, 
  Phone, 
  Camera, 
  LogOut, 
  Trash2, 
  UserMinus, 
  CheckCircle2, 
  Loader2, 
  RefreshCcw,
  Shield,
  Heart,
  Settings,
  Navigation
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VolunteerInvitations } from './VolunteerInvitations';
import { db, auth, updateProfile } from '@/src/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';

export function UserProfile({
  focusVolunteerSetup = false,
  onFocusVolunteerSetupHandled,
}: {
  focusVolunteerSetup?: boolean;
  onFocusVolunteerSetupHandled?: () => void;
}) {
  const [user, setUser] = useState(auth.currentUser);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  
  const [profileData, setProfileData] = useState({
    displayName: '',
    photoURL: '',
    email: ''
  });

  const [volunteerData, setVolunteerData] = useState({
    skills: '',
    location: '',
    phone: '',
    availability: 'available' as 'available' | 'busy' | 'offline'
  });
  const volunteerSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        setProfileData({
          displayName: u.displayName || '',
          photoURL: u.photoURL || '',
          email: u.email || ''
        });
        await fetchVolunteerStatus(u.uid);
        
        // Listen for pending invitations count
        const invQ = query(
          collection(db, 'invitations'),
          where('volunteerId', '==', u.uid),
          where('status', '==', 'pending')
        );
        const unsubscribeInvs = onSnapshot(invQ, (snapshot) => {
          setPendingCount(snapshot.size);
        });
        
        return () => {
          unsubscribeInvs();
        };
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (focusVolunteerSetup && !isLoading && !isVolunteer) {
      volunteerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onFocusVolunteerSetupHandled?.();
    }
  }, [focusVolunteerSetup, isLoading, isVolunteer, onFocusVolunteerSetupHandled]);

  const fetchVolunteerStatus = async (uid: string) => {
    setIsLoading(true);
    try {
      const vDoc = await getDoc(doc(db, 'volunteers', uid));
      if (vDoc.exists()) {
        const data = vDoc.data();
        setIsVolunteer(true);
        setVolunteerData({
          skills: Array.isArray(data.skills) ? data.skills.join(', ') : '',
          location: data.location || '',
          phone: data.phone || '',
          availability: data.availability || 'available'
        });
      } else {
        setIsVolunteer(false);
      }
    } catch (error) {
      console.error("Error fetching volunteer status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateProfile(user, {
        displayName: profileData.displayName,
        photoURL: profileData.photoURL
      });
      
      // Update users collection too
      await setDoc(doc(db, 'users', user.uid), {
        name: profileData.displayName,
        photoURL: profileData.photoURL
      }, { merge: true });

      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(`Error updating profile: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateVolunteer = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const skillsArray = volunteerData.skills.split(',').map(s => s.trim()).filter(s => s);
      const data = {
        name: profileData.displayName,
        email: user.email,
        skills: skillsArray,
        location: volunteerData.location,
        phone: volunteerData.phone,
        availability: volunteerData.availability,
        uid: user.uid,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'volunteers', user.uid), data, { merge: true });
      
      // Ensure user role is volunteer
      await setDoc(doc(db, 'users', user.uid), { role: 'volunteer' }, { merge: true });
      
      setIsVolunteer(true);
      toast.success("Volunteer profile updated!");
    } catch (error: any) {
      toast.error(`Error updating volunteer profile: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveVolunteer = async () => {
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'volunteers', user.uid));
      // Update user role to standard
      await setDoc(doc(db, 'users', user.uid), { 
        role: 'user',
        email: user.email,
        name: user.displayName || profileData.displayName
      }, { merge: true });
      
      setIsVolunteer(false);
      // Reset volunteer form data
      setVolunteerData({
        skills: '',
        location: '',
        phone: '',
        availability: 'available'
      });
      
      setShowConfirmStop(false);
      toast.success("You are no longer a volunteer.");
    } catch (error: any) {
      console.error("Error removing volunteer:", error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setIsDeleting(true);
    const loadingToast = toast.loading("Deleting everything...");
    try {
      const uid = user.uid;
      const batch = writeBatch(db);

      batch.delete(doc(db, 'users', uid));
      batch.delete(doc(db, 'volunteers', uid));

      const invQuery = query(collection(db, 'invitations'), where('volunteerId', '==', uid));
      const invSnap = await getDocs(invQuery);
      invSnap.forEach(d => batch.delete(d.ref));

      const reqQuery = query(collection(db, 'requests'), where('reportedBy', '==', uid));
      const reqSnap = await getDocs(reqQuery);
      reqSnap.forEach(d => batch.delete(d.ref));

      await batch.commit();
      await auth.signOut();
      toast.dismiss(loadingToast);
      toast.success("Account deleted.");
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    toast.info("Detecting location...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          const city = data.address.city || data.address.town || data.address.village || data.address.suburb || "";
          const state = data.address.state || "";
          const locationString = city && state ? `${city}, ${state}` : city || state || "Unknown Location";
          
          setVolunteerData(prev => ({ ...prev, location: locationString }));
          toast.success(`Location detected: ${locationString}`);
        } catch (error) {
          console.error("Geocoding error:", error);
          toast.error("Failed to resolve location name");
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast.error("Permission denied or location unavailable");
      }
    );
  };

  if (!user) {
    return (
      <Card className="border-4 border-dashed border-slate-100 rounded-[3rem] bg-white/50 backdrop-blur-md">
        <CardContent className="py-24 text-center space-y-6">
          <div className="bg-slate-50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto shadow-inner">
            <User className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Access Your Profile</h3>
            <p className="text-slate-400 font-medium">Please sign in to manage your humanitarian identity.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="relative">
           <Loader2 className="w-12 h-12 animate-spin text-primary" />
           <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
           </div>
        </div>
        <p className="font-black text-[10px] uppercase tracking-[0.3em] text-slate-300">Synchronizing Identity</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <div className="flex flex-col lg:flex-row gap-12">
        {/* Left Sidebar: Profile Card */}
        <div className="lg:w-[24rem] xl:w-[26rem] shrink-0">
          <Card className="overflow-hidden border-none shadow-2xl rounded-[3rem] bg-white group h-full">
            <div className="h-40 bg-gradient-to-br from-[#79b9de] via-[#67a9d1] to-[#8fd2ea] relative">
              <div className="absolute inset-0 bg-black/10 mix-blend-overlay" />
              <div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
                <div className="relative">
                  <Avatar className="w-32 h-32 border-[6px] border-white shadow-2xl ring-4 ring-primary/10">
                    <AvatarImage src={profileData.photoURL || undefined} />
                    <AvatarFallback className="text-3xl font-black bg-slate-50 text-slate-300">
                      {profileData.displayName?.charAt(0) || <User className="w-12 h-12" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute bottom-1 right-1 bg-[#5fa8d3] w-6 h-6 rounded-full border-4 border-white shadow-lg shadow-sky-200/60" />
                </div>
              </div>
            </div>
            <CardContent className="pt-20 pb-8 text-center space-y-4">
              <div className="space-y-3 px-2">
                <h3 className="text-2xl font-black tracking-tighter text-slate-900 leading-tight">
                  {profileData.displayName || 'Beacon Rescuer'}
                </h3>
                <div className="rounded-[1.4rem] bg-slate-50/80 px-4 py-3 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 mb-2">Email address</p>
                  <p className="text-[11px] font-bold text-slate-500 break-all leading-5 flex items-start justify-center gap-2 normal-case tracking-normal">
                    <Mail className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{profileData.email}</span>
                  </p>
                </div>
              </div>
              
              <div className="pt-4 flex flex-wrap justify-center gap-2">
                {isVolunteer ? (
                  <Badge className="bg-primary/10 text-primary border-none text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
                    <Heart className="w-3 h-3 mr-2 fill-primary animate-pulse" /> Active Volunteer
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
                    Standard User
                  </Badge>
                )}
              </div>
            </CardContent>
            <div className="px-8 pb-8 space-y-2 mt-auto">
              <Button 
                variant="ghost" 
                className="w-full h-14 rounded-2xl justify-start font-black text-slate-500 hover:text-primary hover:bg-primary/5 transition-all active:scale-95"
                onClick={() => auth.signOut()}
              >
                <LogOut className="w-5 h-5 mr-3" /> Logout
              </Button>
              
              <div className="pt-4 border-t border-slate-50">
                {showConfirmDelete ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full p-6 bg-red-50 rounded-[2rem] border border-red-100 space-y-4 text-center"
                  >
                    <p className="text-xs text-red-700 font-black uppercase tracking-widest">Permanent Action</p>
                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="flex-1 h-12 rounded-xl text-xs font-black shadow-lg shadow-red-200"
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                      >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 h-12 rounded-xl text-xs font-black border-slate-200"
                        onClick={() => setShowConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <Button 
                    variant="ghost" 
                    className="w-full h-14 rounded-2xl justify-start font-black text-red-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                    onClick={() => setShowConfirmDelete(true)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-5 h-5 mr-3" /> Terminate Account
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Content: Settings & Invitations */}
        <div className="lg:w-2/3 xl:w-3/4 space-y-8">
          {isVolunteer ? (
            <Tabs defaultValue="settings" className="w-full">
              <TabsList className="flex gap-2 bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50 backdrop-blur-sm mb-8">
                <TabsTrigger value="settings" className="px-8 py-3 rounded-xl text-sm font-black transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Identity Settings
                  </div>
                </TabsTrigger>
                <TabsTrigger value="invitations" className="px-8 py-3 rounded-xl text-sm font-black transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary">
                   <div className="flex items-center gap-2 relative">
                    <Mail className="w-4 h-4" />
                    Active Missions
                    {pendingCount > 0 && (
                      <span className="absolute -top-1 -right-4 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                        {pendingCount}
                      </span>
                    )}
                  </div>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-8 mt-0 focus-visible:outline-none">
                {renderSettings()}
              </TabsContent>

              <TabsContent value="invitations" className="mt-0 focus-visible:outline-none">
                <VolunteerInvitations />
              </TabsContent>
            </Tabs>
          ) : (
            renderSettings()
          )}
        </div>
      </div>
    </div>
  );

  function renderSettings() {
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Basic Info */}
        <div ref={volunteerSectionRef} className="space-y-6">
          <div className="flex items-center gap-4 ml-2">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">Public Identity</h4>
              <p className="text-sm font-medium text-slate-400">Manage how communities see you.</p>
            </div>
          </div>
          
          <Card className="rounded-[2.5rem] border-white shadow-2xl shadow-slate-100/50 overflow-hidden">
            <CardContent className="p-10 grid md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Full Name</label>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
                  <Input 
                    value={profileData.displayName}
                    onChange={e => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                    className="h-14 pl-14 rounded-2xl bg-slate-50 border-none focus-visible:ring-primary font-bold text-slate-900"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Avatar Source URL</label>
                <div className="relative group">
                  <Camera className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
                  <Input 
                    value={profileData.photoURL}
                    onChange={e => setProfileData(prev => ({ ...prev, photoURL: e.target.value }))}
                    className="h-14 pl-14 rounded-2xl bg-slate-50 border-none focus-visible:ring-primary font-bold text-slate-900"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 p-6 border-t border-slate-50">
              <Button 
                onClick={handleUpdateProfile} 
                disabled={isSubmitting} 
                className="ml-auto h-12 px-8 rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                Sync Profile
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Volunteer Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-4 ml-2">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <Shield className={`w-5 h-5 ${isVolunteer ? 'text-primary' : 'text-slate-400'}`} />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 tracking-tight">Mission Readiness</h4>
              <p className="text-sm font-medium text-slate-400">Configure your technical skills and physical location.</p>
            </div>
          </div>

          <Card className={`rounded-[2.5rem] overflow-hidden border-none shadow-2xl transition-all duration-700 ${isVolunteer ? 'bg-white' : 'bg-[#DBEAFE]/30 ring-4 ring-[#DBEAFE]/20 ring-inset'}`}>
            {!isVolunteer && (
              <div className="p-10 pb-0 flex flex-col items-center text-center space-y-4">
                 <div className="bg-[#5fa8d3] p-4 rounded-3xl shadow-xl shadow-sky-200/60 -rotate-2">
                   <Heart className="w-8 h-8 text-white fill-white" />
                 </div>
                 <div className="space-y-2">
                   <h3 className="text-2xl font-black text-slate-900 tracking-tight">Step Forward as a Hero</h3>
                   <p className="text-slate-500 font-medium max-w-sm">Join our proactive network of first responders and community keepers.</p>
                 </div>
              </div>
            )}
            
            <CardContent className="p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Expertise & Artifacts (Comma Separated)</label>
                <Textarea 
                  value={volunteerData.skills}
                  onChange={e => setVolunteerData(prev => ({ ...prev, skills: e.target.value }))}
                  placeholder="Medical Support, Professional Driving, High-Altitude Rescue, Logistics..."
                  className="min-h-[120px] p-6 rounded-[2rem] border-none bg-slate-50 focus-visible:ring-primary font-bold text-slate-900 placeholder:text-slate-300 resize-none shadow-inner"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Secure Contact</label>
                  <div className="relative group">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
                    <Input 
                      value={volunteerData.phone}
                      onChange={e => setVolunteerData(prev => ({ ...prev, phone: e.target.value }))}
                      className="h-14 pl-14 rounded-2xl bg-slate-50 border-none focus-visible:ring-primary font-bold text-slate-900"
                      placeholder="Required mobile number"
                      required={!isVolunteer}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Global Deployment Zone</label>
                  <div className="flex gap-3">
                    <div className="relative flex-1 group">
                      <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
                      <Input 
                        value={volunteerData.location}
                        onChange={e => setVolunteerData(prev => ({ ...prev, location: e.target.value }))}
                        className="h-14 pl-14 rounded-2xl bg-slate-50 border-none focus-visible:ring-primary font-bold text-slate-900"
                        placeholder="City, Province"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={detectLocation}
                      className="h-14 w-14 rounded-2xl border-slate-100 bg-white hover:bg-primary/5 hover:text-primary hover:border-primary/20 shadow-sm active:scale-90 transition-all"
                    >
                      <Navigation className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 text-center block">System Signal</label>
                <div className="flex flex-wrap gap-4 justify-center">
                  {(['available', 'busy', 'offline'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setVolunteerData(prev => ({ ...prev, availability: status }))}
                      className={`h-14 px-8 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 flex items-center gap-3 border-2 ${
                        volunteerData.availability === status 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200' 
                          : 'bg-white text-slate-400 border-slate-50 hover:border-slate-100 hover:text-slate-600'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'available' ? 'bg-[#5fa8d3] shadow-[0_0_8px_rgba(95,168,211,0.6)]' :
                        status === 'busy' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]' :
                        'bg-slate-300'
                      }`} />
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-slate-50/50 p-10 flex flex-col md:flex-row items-center gap-6">
              {isVolunteer && (
                <div className="flex-1 w-full order-2 md:order-1">
                  {showConfirmStop ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-6 bg-orange-50 rounded-[2rem] border border-orange-100 flex flex-col md:flex-row items-center gap-4"
                    >
                      <p className="text-sm font-bold text-orange-700 flex-1">Pause your heroism? You can rejoin anytime.</p>
                      <div className="flex gap-2 shrink-0">
                        <Button 
                          variant="destructive" 
                          className="h-10 px-6 rounded-xl font-black text-xs h-10"
                          onClick={handleRemoveVolunteer}
                          disabled={isSubmitting}
                        >
                          Confirm
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-10 px-6 rounded-xl font-black text-xs border-orange-200 bg-white"
                          onClick={() => setShowConfirmStop(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <Button 
                      variant="ghost" 
                      className="h-14 px-8 rounded-2xl font-black text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-all"
                      onClick={() => setShowConfirmStop(true)}
                    >
                      <UserMinus className="w-5 h-5 mr-3" /> Deactivate Volunteer Status
                    </Button>
                  )}
                </div>
              )}
              <Button 
                onClick={handleUpdateVolunteer} 
                disabled={isSubmitting || showConfirmStop || (!isVolunteer && !volunteerData.phone.trim())} 
                className={`order-1 md:order-2 h-16 px-12 rounded-[1.5rem] font-black text-lg transition-all active:scale-95 shadow-2xl shadow-sky-200/50 ${isVolunteer ? 'w-full md:w-auto bg-slate-900 border-none hover:bg-slate-800' : 'w-full bg-[#5fa8d3] hover:bg-[#4d96c2]'}`}
              >
                {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mr-3" /> : <CheckCircle2 className="w-6 h-6 mr-3" />}
                {isVolunteer ? 'Update Credentials' : 'Commit to Excellence'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }
}
