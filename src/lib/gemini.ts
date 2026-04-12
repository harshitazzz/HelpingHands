import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getChatResponse(message: string, history: { role: string, parts: { text: string }[] }[]) {
  // Ensure history starts with 'user' role and alternates correctly.
  // Gemini API requires the first message to be from the user.
  const validHistory = [];
  let lastRole = "";
  
  for (const item of history) {
    const currentRole = item.role === 'model' ? 'model' : 'user';
    if (validHistory.length === 0 && currentRole === 'model') continue;
    if (currentRole === lastRole) continue;
    
    validHistory.push({
      role: currentRole,
      parts: item.parts
    });
    lastRole = currentRole;
  }

  const chat = ai.chats.create({
    model: "gemini-flash-latest",
    config: {
      systemInstruction: `You are Beacon, an AI assistant for an NGO Volunteer Matching platform. 
      Your goal is to help users report emergencies or issues. 
      Ask questions one by one to gather:
      1. What is the issue?
      2. Where is the location?
      3. How many people are affected?
      4. What type of help is needed?
      
      Be empathetic and professional. Once you have all the info, summarize it and tell the user you are creating a request.`,
    },
    history: validHistory,
  });

  const response = await chat.sendMessage({ message: message });
  return response.text;
}

export async function getStructuredEmergencyData(text: string) {
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
        },
        required: ["issue", "location", "urgency"],
      },
    },
  });
  return JSON.parse(response.text);
}

export async function textToSpeech(text: string) {
  if (!text || text.trim().length === 0) return;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Gemini TTS returns raw PCM audio (16-bit, mono, 24kHz)
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcmData = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
    }
  } catch (e) {
    console.error("Error playing audio:", e);
  }
}
