import React, { useState, useEffect } from 'react';
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
import { db, auth, updateProfile } from '@/src/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';

export function UserProfile() {
  const [user, setUser] = useState(auth.currentUser);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
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
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

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
          // Reverse geocoding using a free API (OpenStreetMap)
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
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-4">
          <User className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-medium">Sign in to manage your profile</h3>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Sidebar: Profile Card */}
        <div className="md:w-1/3 space-y-6">
          <Card className="overflow-hidden border-none shadow-xl bg-white">
            <div className="h-24 bg-primary relative">
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                <Avatar className="w-24 h-24 border-4 border-white shadow-lg">
                  <AvatarImage src={profileData.photoURL || undefined} />
                  <AvatarFallback className="text-2xl font-bold bg-slate-100">
                    {profileData.displayName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <CardContent className="pt-16 pb-6 text-center space-y-2">
              <h3 className="text-xl font-black tracking-tight">{profileData.displayName || 'Anonymous User'}</h3>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Mail className="w-3 h-3" /> {profileData.email}
              </p>
              <div className="pt-4 flex flex-wrap justify-center gap-2">
                {isVolunteer ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <Heart className="w-3 h-3 mr-1" /> Active Volunteer
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-400">
                    Standard User
                  </Badge>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 border-t bg-slate-50/50 pt-4">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-600 hover:text-primary"
                onClick={() => auth.signOut()}
              >
                <LogOut className="w-4 h-4 mr-2" /> Logout
              </Button>
              
              {showConfirmDelete ? (
                <div className="w-full p-3 bg-red-50 rounded-lg border border-red-100 space-y-3">
                  <p className="text-xs text-red-700 font-medium">Are you sure? This is permanent.</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      Yes, Delete
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      onClick={() => setShowConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => setShowConfirmDelete(true)}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Account
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Right Content: Settings */}
        <div className="md:w-2/3 space-y-6">
          {/* Basic Info */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" /> Basic Information
              </CardTitle>
              <CardDescription>Update your public profile details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    value={profileData.displayName}
                    onChange={e => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                    className="pl-10"
                    placeholder="Your Name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Profile Photo URL</label>
                <div className="relative">
                  <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    value={profileData.photoURL}
                    onChange={e => setProfileData(prev => ({ ...prev, photoURL: e.target.value }))}
                    className="pl-10"
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={isSubmitting} className="ml-auto">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </CardFooter>
          </Card>

          {/* Volunteer Section */}
          <Card className={`shadow-sm border-slate-200 transition-all duration-300 ${isVolunteer ? 'border-l-4 border-l-green-500' : 'bg-blue-50/30 border-dashed border-2 border-blue-200'}`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className={`w-5 h-5 ${isVolunteer ? 'text-green-600' : 'text-blue-600'}`} /> 
                {isVolunteer ? 'Volunteer Profile' : 'Become a Volunteer'}
              </CardTitle>
              <CardDescription>
                {isVolunteer 
                  ? "Manage your skills and availability for emergency matching." 
                  : "Join our network of responders to help in crises. Fill out the details below to start."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Skills (comma separated)</label>
                <Textarea 
                  value={volunteerData.skills}
                  onChange={e => setVolunteerData(prev => ({ ...prev, skills: e.target.value }))}
                  placeholder="Medical, Driving, Cooking, First Aid..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      value={volunteerData.phone}
                      onChange={e => setVolunteerData(prev => ({ ...prev, phone: e.target.value }))}
                      className="pl-10"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-slate-500">Location</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        value={volunteerData.location}
                        onChange={e => setVolunteerData(prev => ({ ...prev, location: e.target.value }))}
                        className="pl-10"
                        placeholder="City, State"
                      />
                    </div>
                    <Button variant="outline" size="icon" onClick={detectLocation} title="Detect my location">
                      <Navigation className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Current Availability</label>
                <div className="flex gap-2">
                  {(['available', 'busy', 'offline'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={volunteerData.availability === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVolunteerData(prev => ({ ...prev, availability: status }))}
                      className="flex-1 capitalize"
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-4">
              {isVolunteer && (
                <>
                  {showConfirmStop ? (
                    <div className="flex-1 p-3 bg-orange-50 rounded-lg border border-orange-100 space-y-2">
                      <p className="text-xs text-orange-700 font-medium">Stop volunteering? Your profile will be hidden.</p>
                      <div className="flex gap-2">
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="flex-1 h-8 text-xs"
                          onClick={handleRemoveVolunteer}
                          disabled={isSubmitting}
                        >
                          Confirm Stop
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 h-8 text-xs"
                          onClick={() => setShowConfirmStop(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => setShowConfirmStop(true)}>
                      <UserMinus className="w-4 h-4 mr-2" /> Stop Volunteering
                    </Button>
                  )}
                </>
              )}
              <Button 
                onClick={handleUpdateVolunteer} 
                disabled={isSubmitting || showConfirmStop} 
                className={isVolunteer ? '' : 'w-full bg-blue-600 hover:bg-blue-700'}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {isVolunteer ? 'Update Volunteer Data' : 'Complete Volunteer Registration'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
