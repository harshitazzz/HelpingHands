import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc, 
  Timestamp,
  addDoc,
  serverTimestamp,
  arrayUnion
} from "firebase/firestore";
import fs from "fs";

dotenv.config();

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending email invitations
  app.post("/api/send-invitation", async (req, res) => {
    const { email, name, location, issue, acceptLink, rejectLink } = req.body;
    const resendApiKey = process.env.RESEND_API_KEY;

    console.log(`[Notification API] Request to notify: ${email}`);
    
    // --- EMAIL LOGIC ---
    let emailSent = false;
    if (resendApiKey && resendApiKey.trim() !== "") {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: email,
          subject: `🚨 Emergency Mission Invitation: ${location}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #ef4444;">Emergency Mission Invitation</h2>
              <p>Hi ${name},</p>
              <p>You have been invited to an emergency mission in <strong>${location}</strong>.</p>
              <p><strong>Issue:</strong> ${issue}</p>
              <p>Please respond using the links below:</p>
              <p>
                <a href="${acceptLink}" style="color: #16a34a; font-weight: bold;">[ACCEPT MISSION]</a>
                &nbsp;&nbsp;&nbsp;
                <a href="${rejectLink}" style="color: #dc2626; font-weight: bold;">[DECLINE]</a>
              </p>
              <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Sent via Beacon Emergency Response System.</p>
            </div>
          `,
        });
        emailSent = true;
        console.log(`[Notification API] Email sent to ${email}`);
      } catch (error) {
        console.error("[Notification API] Email error:", error);
      }
    } else {
      console.warn("[Notification API] RESEND_API_KEY missing. Email simulated.");
    }

    res.status(200).json({ 
      success: true, 
      emailSent, 
      message: "Notification processed" 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start background task for timeout escalation
    setInterval(checkStaleInvitations, 10 * 60 * 1000); // Every 10 minutes
    console.log("[Background Task] Stale invitation checker started.");
  });
}

async function checkStaleInvitations() {
  console.log("[Background Task] Checking for stale invitations...");
  try {
    const fiveHoursAgo = new Date();
    fiveHoursAgo.setHours(fiveHoursAgo.getHours() - 5);
    
    const invRef = collection(db, "invitations");
    const q = query(invRef, where("status", "==", "pending"), where("createdAt", "<=", Timestamp.fromDate(fiveHoursAgo)));
    
    const snapshot = await getDocs(q);
    console.log(`[Background Task] Found ${snapshot.size} stale invitations.`);
    
    // Group by requestId to avoid multiple escalations for the same request in one pass
    const requestsToEscalate = new Set<string>();
    
    for (const invDoc of snapshot.docs) {
      const invData = invDoc.data();
      console.log(`[Background Task] Expiring invitation ${invDoc.id} for request ${invData.requestId}`);
      
      // 1. Mark as expired
      await updateDoc(doc(db, "invitations", invDoc.id), { status: "expired" });
      requestsToEscalate.add(invData.requestId);
    }

    for (const requestId of requestsToEscalate) {
      await triggerNextMatch(requestId);
    }
  } catch (error) {
    console.error("[Background Task] Error checking stale invitations:", error);
  }
}

async function triggerNextMatch(requestId: string) {
  try {
    const reqRef = doc(db, "requests", requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return;
    
    const reqData = reqSnap.data();

    // 0. Check if already resolved
    if (reqData.status === 'resolved') {
      console.log(`[Background Task] Request ${requestId} is already resolved. Skipping escalation.`);
      return;
    }

    const volunteersNeeded = reqData.volunteers_needed || 1;
    const assignedVolunteers = reqData.assignedVolunteers || [];
    const notifiedVolunteers = reqData.notifiedVolunteers || [];

    // Get current pending invitations
    const invQuery = query(
      collection(db, "invitations"), 
      where("requestId", "==", requestId), 
      where("status", "==", "pending")
    );
    const invSnapshot = await getDocs(invQuery);
    const pendingCount = invSnapshot.size;

    const currentTotal = assignedVolunteers.length + pendingCount;
    const neededCount = volunteersNeeded - currentTotal;

    if (neededCount <= 0) {
      console.log(`[Background Task] Request ${requestId} already has enough volunteers (${currentTotal}/${volunteersNeeded})`);
      return;
    }
    
    // Find next best volunteers
    const volunteersRef = collection(db, "volunteers");
    const q = query(volunteersRef, where("availability", "==", "available"));
    const vSnapshot = await getDocs(q);
    
    const availableVolunteers: any[] = [];
    vSnapshot.forEach(d => {
      if (!notifiedVolunteers.includes(d.id)) {
        availableVolunteers.push({ uid: d.id, ...d.data() });
      }
    });
    
    if (availableVolunteers.length === 0) {
      if (currentTotal === 0) {
        await updateDoc(reqRef, { noVolunteersAvailable: true });
      }
      return;
    }
    
    // Simple scoring (matching logic from matching.ts)
    // For simplicity in server-side, just take the first available up to neededCount
    const bestMatches = availableVolunteers.slice(0, neededCount);
    const newlyNotified: string[] = [];

    for (const bestMatch of bestMatches) {
      // Create new invitation
      const newInvRef = await addDoc(collection(db, "invitations"), {
        requestId,
        volunteerId: bestMatch.uid,
        status: "pending",
        createdAt: serverTimestamp()
      });
      newlyNotified.push(bestMatch.uid);
      
      console.log(`[Background Task] New invitation sent to ${bestMatch.email} for request ${requestId}`);
    }
    
    await updateDoc(reqRef, {
      notifiedVolunteers: arrayUnion(...newlyNotified),
      lastInvitationSentAt: serverTimestamp(),
      noVolunteersAvailable: false
    });
    
  } catch (error) {
    console.error(`[Background Task] Error triggering next match for ${requestId}:`, error);
  }
}

startServer();
