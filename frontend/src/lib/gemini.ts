import { GoogleGenAI, Type, Modality } from "@google/genai";

function getGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  console.log(`[Gemini Auth Check] Read VITE_GEMINI_API_KEY prefix: "${apiKey ? apiKey.substring(0, 10) + "..." : "missing"}" (length: ${apiKey.length})`);
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

  const modelsToTry = ["gemini-3.5-flash",
    "gemini-3.1-flash-lite",
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Client] Attempting getChatResponse with model: "${model}"`);
      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction: `You are Helping Hands, an AI assistant for an NGO platform.
          Your goal is to help users report emergencies or issues.
          IMPORTANT: The user's GPS location is automatically detected and injected into the conversation — NEVER ask for location, it is already known.
          Ask questions one by one to gather:
          1. What is the issue?
          2. How many people are affected?
          3. What type of help is needed?

          Be empathetic and professional. Once you have all the info, summarize it in a strict format as follows:
          [EMERGENCY_SUMMARY_START]
          ISSUE: [Brief description]
          LOCATION: [Use the GPS coordinates or address from the conversation context]
          AFFECTED: [Number of people]
          HELP: [Specific help needed]
          [EMERGENCY_SUMMARY_END]
          After the summary, ask the user if they'd like to submit this report.`,
        },
        history: validHistory,
      });

      const response = await chat.sendMessage({ message });
      console.log(`[Gemini Client] Success using model: "${model}"`);
      return response.text;
    } catch (e: any) {
      lastError = e;
      console.warn(`[Gemini Client] Model "${model}" failed:`, e);
    }
  }
  throw lastError;
}

export async function getStructuredEmergencyData(text: string) {
  const ai = getGeminiClient();
  const modelsToTry = ["gemini-3.5-flash",
    "gemini-3.1-flash-lite",];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Client] Attempting getStructuredEmergencyData with model: "${model}"`);
      const response = await ai.models.generateContent({
        model,
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
              gps: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER, description: "Approximate latitude of the location" },
                  lng: { type: Type.NUMBER, description: "Approximate longitude of the location" }
                },
                required: ["lat", "lng"]
              }
            },
            required: ["issue", "location", "urgency", "image_keyword", "gps"],
          },
        },
      });
      console.log(`[Gemini Client] Success extracting structured data using model: "${model}"`);
      return JSON.parse(response.text);
    } catch (e: any) {
      lastError = e;
      console.warn(`[Gemini Client] Model "${model}" failed during structuring:`, e);
    }
  }
  throw lastError;
}

export async function getPredictiveAnalysis(location: string = "Global") {
  const ai = getGeminiClient();
  const modelsToTry = ["gemini-3.5-flash",
    "gemini-3.1-flash-lite",
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Client] Attempting getPredictiveAnalysis with model: "${model}"`);
      const response = await ai.models.generateContent({
        model,
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
      console.log(`[Gemini Client] Success predicting analysis using model: "${model}"`);
      return JSON.parse(response.text);
    } catch (e: any) {
      lastError = e;
      console.warn(`[Gemini Client] Model "${model}" failed during prediction:`, e);
    }
  }
  throw lastError;
}

/** Returns true if text contains Devanagari characters (Hindi). */
function isHindiText(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Speak text using browser's SpeechSynthesis API.
 * Automatically picks a Hindi voice for Devanagari text, English otherwise.
 * Handles the async voice-loading race condition browsers have.
 */
function speakWithBrowser(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel(); // stop any previous speech

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang  = isHindiText(text) ? 'hi-IN' : 'en-US';
  utterance.rate  = 0.95;
  utterance.pitch = 1.0;

  const assignVoiceAndSpeak = () => {
    const targetLang = isHindiText(text) ? 'hi' : 'en';
    const voices     = window.speechSynthesis.getVoices();
    const voice      = voices.find((v) => v.lang.startsWith(targetLang))
      ?? voices.find((v) => v.lang.startsWith('en')); // ultimate English fallback
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  // Browsers load voices asynchronously; wait if not ready
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    assignVoiceAndSpeak();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', assignVoiceAndSpeak, { once: true });
  }
}

export async function textToSpeech(text: string) {
  if (!text || text.trim().length === 0) return;

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  const ai = getGeminiClient();

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Client] Attempting textToSpeech with model: "${model}"`);
      // Gemini TTS reads the language from the text content automatically.
      const response = await ai.models.generateContent({
        model,
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
        const pcmData    = new Int16Array(bytes.buffer);
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
        console.log(`[Gemini Client] TTS successfully played using model: "${model}"`);
        return;
      }
    } catch (e) {
      console.error(`[Gemini Client] TTS failed using model "${model}":`, e);
    }
  }

  // Fallback: use browser's built-in SpeechSynthesis (supports both Hindi & English)
  console.log("[Gemini Client] Falling back to browser SpeechSynthesis.");
  speakWithBrowser(text);
}

