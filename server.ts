import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending email invitations
  app.post("/api/send-invitation", async (req, res) => {
    const { email, name, location, issue, acceptLink, rejectLink } = req.body;
    const apiKey = process.env.RESEND_API_KEY;

    console.log(`[Email API] Request to send email to: ${email}`);
    
    if (apiKey) {
      console.log(`[Email API] API Key found (starts with: ${apiKey.substring(0, 3)}...)`);
    } else {
      console.warn("[Email API] RESEND_API_KEY is missing from environment variables.");
    }

    if (!apiKey || apiKey.trim() === "") {
      console.warn("[Email API] RESEND_API_KEY not found or empty. Email simulation only.");
      return res.status(200).json({ 
        success: true, 
        simulated: true, 
        message: "Email simulated (API key missing)" 
      });
    }

    try {
      console.log("[Email API] Initializing Resend client...");
      const resend = new Resend(apiKey);
      
      console.log(`[Email API] Sending email via Resend to ${email}...`);
      // Use onboarding@resend.dev as it's the default for unverified domains
      // Simplified 'from' to avoid potential parsing issues with display names
      const { data, error } = await resend.emails.send({
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

      if (error) {
        console.error("[Email API] Resend returned an error:", error);
        return res.status(400).json({ success: false, error: error.message || "Resend API error" });
      }

      console.log("[Email API] Resend success response:", data);
      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("[Email API] Unexpected error:", error);
      res.status(500).json({ success: false, error: error.message || "An unexpected error occurred" });
    }
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
  });
}

startServer();
