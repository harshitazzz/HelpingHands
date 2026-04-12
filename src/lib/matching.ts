import { db } from './firebase';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

export interface Volunteer {
  uid: string;
  name: string;
  skills: string[];
  location: string;
  availability: string;
  email: string;
}

// Simple tokenizer and vectorizer for cosine similarity
function getVector(text: string): Record<string, number> {
  const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 1);
  const vector: Record<string, number> = {};
  words.forEach(word => {
    vector[word] = (vector[word] || 0) + 1;
  });
  return vector;
}

function calculateCosineSimilarity(vec1: Record<string, number>, vec2: Record<string, number>): number {
  const intersection = Object.keys(vec1).filter(key => key in vec2);
  
  let dotProduct = 0;
  intersection.forEach(key => {
    dotProduct += vec1[key] * vec2[key];
  });
  
  let mag1 = 0;
  Object.values(vec1).forEach(val => mag1 += val * val);
  mag1 = Math.sqrt(mag1);
  
  let mag2 = 0;
  Object.values(vec2).forEach(val => mag2 += val * val);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

export async function findMatches(requestId: string, requiredSkills: string[], location: string) {
  const volunteersRef = collection(db, 'volunteers');
  
  const q = query(volunteersRef, where('availability', '==', 'available'));
  const querySnapshot = await getDocs(q);
  
  const volunteers: Volunteer[] = [];
  querySnapshot.forEach((doc) => {
    volunteers.push({ uid: doc.id, ...doc.data() } as Volunteer);
  });

  const reqSkillsText = requiredSkills.join(' ');
  const reqVector = getVector(reqSkillsText);

  const scoredVolunteers = volunteers.map(v => {
    const vSkillsText = v.skills.join(' ');
    const vVector = getVector(vSkillsText);
    
    const similarity = calculateCosineSimilarity(reqVector, vVector);
    let score = Math.round(similarity * 100);
    
    // Location match bonus
    if (v.location.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes(v.location.toLowerCase())) {
      score += 20;
    }
    
    // Filter matching skills for display
    const matchingSkills = v.skills.filter(skill => 
      requiredSkills.some(req => req.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(req.toLowerCase()))
    );
    
    return { ...v, score, matchingSkills };
  });

  return scoredVolunteers.sort((a, b) => b.score - a.score);
}

export async function autoAssignVolunteers(requestId: string, requiredSkills: string[], location: string, issue?: string) {
  console.log(`[AutoAssign] Starting for Request: ${requestId}`, { requiredSkills, location, issue });
  
  const volunteersRef = collection(db, 'volunteers');
  
  // 1. Check availability
  const q = query(volunteersRef, where('availability', '==', 'available'));
  const querySnapshot = await getDocs(q);
  
  const volunteers: Volunteer[] = [];
  querySnapshot.forEach((doc) => {
    volunteers.push({ uid: doc.id, ...doc.data() } as Volunteer);
  });

  console.log(`[AutoAssign] Found ${volunteers.length} available volunteers.`);

  // Prepare search text: use requiredSkills + issue description for better matching
  const searchText = [...requiredSkills, issue || ''].join(' ').toLowerCase();
  const reqVector = getVector(searchText);

  // 2. Filter and score
  const matches = volunteers.filter(v => {
    // Location match (strict or partial)
    const vLoc = v.location.toLowerCase();
    const rLoc = location.toLowerCase();
    const locationMatch = vLoc.includes(rLoc) || rLoc.includes(vLoc);
    
    if (!locationMatch) {
      console.log(`[AutoAssign] Volunteer ${v.name} skipped: Location mismatch (${v.location} vs ${location})`);
      return false;
    }

    // Skill match
    const vSkillsText = v.skills.join(' ').toLowerCase();
    const vVector = getVector(vSkillsText);
    const similarity = calculateCosineSimilarity(reqVector, vVector);
    
    console.log(`[AutoAssign] Volunteer ${v.name} similarity score: ${similarity.toFixed(2)}`);
    
    // Be more lenient: if location matches and there's ANY skill overlap, or if skills are empty
    return similarity > 0.05 || v.skills.length === 0; 
  });

  console.log(`[AutoAssign] Found ${matches.length} matches.`);

  // 3. Create invitations and simulate email with deep links
  const baseUrl = window.location.origin;
  for (const volunteer of matches) {
    const invitationId = await assignVolunteer(requestId, volunteer.uid);
    
    const acceptLink = `${baseUrl}?accept=${invitationId}`;
    const rejectLink = `${baseUrl}?reject=${invitationId}`;

    // Call the backend API to send real email
    try {
      const response = await fetch("/api/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: volunteer.email,
          name: volunteer.name,
          location,
          issue: issue || requiredSkills.join(', '),
          acceptLink,
          rejectLink
        })
      });
      
      const result = await response.json();
      if (result.success) {
        if (result.simulated) {
          toast.info(`Email simulated for ${volunteer.email}`, {
            description: "Set RESEND_API_KEY in secrets for real emails.",
            duration: 5000
          });
        } else {
          toast.success(`Invitation email sent to ${volunteer.email}!`, {
            description: "Note: Resend free tier only delivers to your own account email.",
            duration: 8000
          });
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Failed to send invitation email:", error);
      toast.error(`Failed to send email to ${volunteer.email}`);
    }

    // Log to console (Backup/Simulation)
    console.log(`
      --------------------------------------------------
      [INVITATION DETAILS]
      To: ${volunteer.email}
      Subject: 🚨 Emergency Mission Invitation: ${location}
      
      Hi ${volunteer.name},
      
      You have been invited to collaborate on an emergency mission in ${location}.
      Issue: ${issue || requiredSkills.join(', ')}
      
      [ACCEPT MISSION]: ${acceptLink}
      [DECLINE MISSION]: ${rejectLink}
      --------------------------------------------------
    `);
  }

  return matches.length;
}

export async function assignVolunteer(requestId: string, volunteerId: string) {
  // Instead of direct assignment, create an invitation (Collaborator style)
  const invitationsRef = collection(db, 'invitations');
  const docRef = await addDoc(invitationsRef, {
    requestId,
    volunteerId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function respondToInvitation(invitationId: string, status: 'accepted' | 'rejected') {
  const invRef = doc(db, 'invitations', invitationId);
  
  // Get invitation data first
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) return;
  const invData = invSnap.data();

  await updateDoc(invRef, { status });
  
  if (status === 'accepted') {
    // 1. Assign volunteer to request
    const requestRef = doc(db, 'requests', invData.requestId);
    await updateDoc(requestRef, {
      assignedVolunteers: arrayUnion(invData.volunteerId),
      status: 'assigned'
    });

    // 2. Change volunteer status to busy
    const volunteerRef = doc(db, 'volunteers', invData.volunteerId);
    await updateDoc(volunteerRef, {
      availability: 'busy'
    });

    // 3. Update user role record
    const userRef = doc(db, 'users', invData.volunteerId);
    await updateDoc(userRef, {
      availability: 'busy'
    }).catch(() => {}); // Optional
  }
}

export async function completeRequest(requestId: string, volunteerId: string) {
  // 1. Mark request as resolved
  const requestRef = doc(db, 'requests', requestId);
  await updateDoc(requestRef, {
    status: 'resolved',
    resolvedAt: serverTimestamp()
  });

  // 2. Change volunteer status back to available
  const volunteerRef = doc(db, 'volunteers', volunteerId);
  await updateDoc(volunteerRef, {
    availability: 'available'
  });

  // 3. Update user role record
  const userRef = doc(db, 'users', volunteerId);
  await updateDoc(userRef, {
    availability: 'available'
  }).catch(() => {});
}
