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
  
  const requestRef = doc(db, 'requests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) return 0;
  const requestData = requestSnap.data();

  // 0. Check if already resolved
  if (requestData.status === 'resolved') {
    console.log(`[AutoAssign] Request ${requestId} is already resolved. Skipping.`);
    return 0;
  }

  const volunteersNeeded = requestData.volunteers_needed || 1;
  const assignedVolunteers = requestData.assignedVolunteers || [];
  const notifiedVolunteers = requestData.notifiedVolunteers || [];

  // Get active invitations for this request
  const invQuery = query(
    collection(db, 'invitations'), 
    where('requestId', '==', requestId), 
    where('status', '==', 'pending')
  );
  const invSnapshot = await getDocs(invQuery);
  const pendingCount = invSnapshot.size;

  const currentTotal = assignedVolunteers.length + pendingCount;
  const neededCount = volunteersNeeded - currentTotal;

  if (neededCount <= 0) {
    console.log(`[AutoAssign] Already have enough volunteers assigned or invited (${currentTotal}/${volunteersNeeded})`);
    return 0;
  }

  const volunteersRef = collection(db, 'volunteers');
  
  // 1. Check availability
  const q = query(volunteersRef, where('availability', '==', 'available'));
  const querySnapshot = await getDocs(q);
  
  const volunteers: Volunteer[] = [];
  querySnapshot.forEach((doc) => {
    const vData = doc.data() as Volunteer;
    // Skip if already notified for this request
    if (!notifiedVolunteers.includes(doc.id)) {
      volunteers.push({ uid: doc.id, ...vData });
    }
  });

  console.log(`[AutoAssign] Found ${volunteers.length} potential available volunteers (excluding already notified). Need ${neededCount} more.`);

  if (volunteers.length === 0) {
    console.log(`[AutoAssign] No more volunteers available for request ${requestId}`);
    if (currentTotal === 0) {
      await updateDoc(requestRef, { 
        noVolunteersAvailable: true,
        lastMatchAttemptAt: serverTimestamp() 
      });
      toast.info("No volunteers available at this moment. We will connect to you soon.");
    }
    return 0;
  }

  // Prepare search text
  const searchText = [...requiredSkills, issue || ''].join(' ').toLowerCase();
  const reqVector = getVector(searchText);

  // 2. Filter and score
  const matches = volunteers.map(v => {
    const vLoc = v.location.toLowerCase();
    const rLoc = location.toLowerCase();
    const locationMatch = vLoc.includes(rLoc) || rLoc.includes(vLoc);
    
    const vSkillsText = v.skills.join(' ').toLowerCase();
    const vVector = getVector(vSkillsText);
    const similarity = calculateCosineSimilarity(reqVector, vVector);
    
    let score = similarity;
    if (locationMatch) score += 0.5; // Strong preference for location

    return { ...v, score };
  }).filter(v => v.score > 0.05 || v.skills.length === 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    console.log(`[AutoAssign] No suitable matches found for request ${requestId}`);
    if (currentTotal === 0) {
      await updateDoc(requestRef, { 
        noVolunteersAvailable: true,
        lastMatchAttemptAt: serverTimestamp() 
      });
      toast.info("No volunteers match the requirements at this moment. We will connect to you soon.");
    }
    return 0;
  }

  // 3. Invite the BEST matches (up to neededCount)
  const bestMatches = matches.slice(0, neededCount);
  console.log(`[AutoAssign] Inviting ${bestMatches.length} best matches.`);

  const baseUrl = window.location.origin;
  const newlyNotified: string[] = [];

  for (const bestMatch of bestMatches) {
    const invitationId = await assignVolunteer(requestId, bestMatch.uid);
    newlyNotified.push(bestMatch.uid);

    const acceptLink = `${baseUrl}?accept=${invitationId}`;
    const rejectLink = `${baseUrl}?reject=${invitationId}`;

    // Call the backend API to send real email
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      await fetch(`${apiUrl}/api/send-invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: bestMatch.email,
          name: bestMatch.name,
          location,
          issue: issue || requiredSkills.join(', '),
          acceptLink,
          rejectLink
        })
      });
      
      toast.success(`Invitation sent to ${bestMatch.name}`);
    } catch (error) {
      console.error("Failed to send invitation:", error);
    }
  }

  // Update request with notified volunteers
  await updateDoc(requestRef, {
    notifiedVolunteers: arrayUnion(...newlyNotified),
    lastInvitationSentAt: serverTimestamp(),
    noVolunteersAvailable: false
  });

  return bestMatches.length;
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
    const requestRef = doc(db, 'requests', invData.requestId);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists() && requestSnap.data().status === 'resolved') {
      toast.error("This mission has already been resolved. Thank you anyway!");
      await updateDoc(invRef, { status: 'expired' });
      return;
    }

    // 1. Assign volunteer to request
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
  } else if (status === 'rejected') {
    // Trigger next match
    const requestRef = doc(db, 'requests', invData.requestId);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists()) {
      const requestData = requestSnap.data();
      // Only trigger if not resolved
      if (requestData.status !== 'resolved') {
        await autoAssignVolunteers(
          invData.requestId, 
          requestData.required_skills || [], 
          requestData.location, 
          requestData.issue
        );
      }
    }
  }
}

export async function completeRequest(requestId: string, volunteerId: string) {
  // 1. Mark request as resolved
  const requestRef = doc(db, 'requests', requestId);
  const requestSnap = await getDoc(requestRef);
  
  await updateDoc(requestRef, {
    status: 'resolved',
    resolvedAt: serverTimestamp()
  });

  // 1.5 Expire any pending invitations for this request
  const invQuery = query(
    collection(db, 'invitations'),
    where('requestId', '==', requestId),
    where('status', '==', 'pending')
  );
  const invSnapshot = await getDocs(invQuery);
  for (const invDoc of invSnapshot.docs) {
    await updateDoc(doc(db, 'invitations', invDoc.id), { status: 'expired' });
  }

  // 2. Change ALL assigned volunteers status back to available
  if (requestSnap.exists()) {
    const data = requestSnap.data();
    const assigned = data.assignedVolunteers || [];
    // Ensure the current volunteer is included if not already in the list for some reason
    const allToRelease = Array.from(new Set([...assigned, volunteerId]));
    
    for (const vId of allToRelease) {
      const volunteerRef = doc(db, 'volunteers', vId);
      await updateDoc(volunteerRef, {
        availability: 'available'
      }).catch(err => console.error(`Failed to release volunteer ${vId}:`, err));

      const userRef = doc(db, 'users', vId);
      await updateDoc(userRef, {
        availability: 'available'
      }).catch(() => {});
    }
  }
}
