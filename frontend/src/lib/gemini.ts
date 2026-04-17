import { GoogleGenAI, Type, Modality } from "@google/genai";

function getGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Set VITE_GEMINI_API_KEY in the frontend environment.");
  }
  return new GoogleGenAI({ apiKey });
}

export async function getChatResponse(
  message: string,
  history: { role: string; parts: { text: string }[] }[]
) {
  const ai = getGeminiClient();

  // Build valid alternating history (must start with 'user', end with 'model')
  const validHistory: { role: string; parts: { text: string }[] }[] = [];
  let lastRole = "";
  for (const item of history) {
    const role = item.role === "model" ? "model" : "user";
    if (validHistory.length === 0 && role === "model") continue;
    if (role === lastRole) continue;
    validHistory.push({ role, parts: item.parts });
    lastRole = role;
  }
  // History must end with 'model'; drop orphaned trailing 'user' (failed previous call)
  if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === "user") {
    validHistory.pop();
  }

  const chat = ai.chats.create({
    model: "gemini-flash-latest",
    config: {
      systemInstruction: `You are Helping Hands, an AI assistant for an NGO platform. 
      Your goal is to help users report emergencies or issues. 
      Ask questions one by one to gather:
      1. What is the issue?
      2. Where is the location?
      3. How many people are affected?
      4. What type of help is needed?
      
      Be empathetic and professional. Once you have all the info, summarize it in a strict format as follows:
      [EMERGENCY_SUMMARY_START]
      ISSUE: [Brief description]
      LOCATION: [Specific place]
      AFFECTED: [Number of people]
      HELP: [Specific help needed]
      [EMERGENCY_SUMMARY_END]
      After the summary, ask the user if they'd like to submit this report.`,
    },
    history: validHistory,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}

export async function getStructuredEmergencyData(text: string) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: `Extract structured emergency data from this text: "${text}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING },
          location: { type: Type.STRING },
          urgency: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
          number_of_people_affected: { type: Type.NUMBER },
          volunteers_needed: { type: Type.NUMBER },
          required_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_keyword: {
            type: Type.STRING,
            description:
              "A single keyword for an image search related to this issue (e.g., 'flood', 'medical', 'fire')",
          },
        },
        required: ["issue", "location", "urgency", "image_keyword"],
      },
    },
  });
  return JSON.parse(response.text);
}

export async function getPredictiveAnalysis(location: string = "Global") {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: `Based on current news, weather patterns, and socio-economic trends for the region: "${location}", predict 3 potential humanitarian needs or risks that might arise in the next 30 days. 
    Consider factors like upcoming weather events, local news reports, and historical data for this area.
    Provide a title, specific location (within or near the region), description, and probability.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            location: { type: Type.STRING },
            description: { type: Type.STRING },
            probability: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["weather", "conflict", "health", "economic"] },
          },
          required: ["title", "location", "description", "probability", "type"],
        },
      },
    },
  });
  return JSON.parse(response.text);
}

export async function textToSpeech(text: string) {
  if (!text || text.trim().length === 0) return;
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcmData = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }
      const audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start(0);
    }
  } catch (e) {
    console.error("TTS error:", e);
  }
}
