import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

class GeminiService {
  final String apiKey;
  static const String _baseEndpoint = "https://generativelanguage.googleapis.com/v1beta/models";

  GeminiService({required this.apiKey}) {
    debugPrint("[Gemini Service Init] API Key Prefix: '${apiKey.length >= 10 ? apiKey.substring(0, 10) + '...' : 'short/missing'}' (length: ${apiKey.length})");
  }

  Future<Map<String, dynamic>> _makeRequestWithRetry(String model, Map<String, dynamic> body, {int retries = 3}) async {
    final url = Uri.parse("$_baseEndpoint/$model:generateContent?key=$apiKey");
    int attempt = 0;

    while (attempt < retries) {
      try {
        final response = await http.post(
          url,
          headers: {"Content-Type": "application/json"},
          body: jsonEncode(body),
        );

        if (response.statusCode == 200) {
          return jsonDecode(response.body);
        } else if (response.statusCode == 503) {
          attempt++;
          if (attempt < retries) {
            debugPrint("Gemini busy (503), retrying in ${attempt * 2}s... (Attempt $attempt of $retries)");
            await Future.delayed(Duration(seconds: attempt * 2));
            continue;
          }
        }
        throw Exception("API Error ${response.statusCode}: ${response.body}");
      } catch (e) {
        if (attempt >= retries - 1) rethrow;
        attempt++;
        await Future.delayed(Duration(seconds: attempt * 2));
      }
    }
    throw Exception("Max retries exceeded");
  }

  String _cleanJsonResponse(String text) {
    text = text.trim();
    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    return text.trim();
  }

  Future<String> getChatResponse(String message, List<Map<String, String>> history) async {
    final contents = history.map((m) => {
      "role": m['role'] == "model" ? "model" : "user",
      "parts": [{"text": m['content']}]
    }).toList();
    
    contents.add({
      "role": "user",
      "parts": [{"text": message}]
    });

    final models = ["gemini-3.5-flash",
  "gemini-3.1-flash-lite"];
    dynamic lastError;

    for (var model in models) {
      try {
        debugPrint("[Gemini Service] Attempting getChatResponse with model: $model");
        final data = await _makeRequestWithRetry(
          model,
          {
            "contents": contents,
            "systemInstruction": {
              "role": "system",
              "parts": [{"text": """You are "Helping Hands", an AI assistant for an NGO emergency reporting platform.

GOAL:
Help users report emergencies by collecting required details step-by-step.

IMPORTANT RULES:
1. Never ask for user location. GPS location is already available in system context.
2. Ask only ONE question at a time.
3. Be empathetic, calm, and professional.
4. Do NOT jump to final summary until all required information is collected.

INFORMATION TO COLLECT:
- What is the issue?
- How many people are affected?
- What type of help is needed?

LANGUAGE RULES:
- Detect user language.
- If input is English → respond in English.
- If input is Hindi (Devanagari) → respond ONLY in Hindi (Devanagari script).
- Do NOT use Hinglish in any case.

FINAL OUTPUT RULE:
When ALL required information is collected, output ONLY this format:

[EMERGENCY_SUMMARY_START]
ISSUE: ...
LOCATION: ...
AFFECTED: ...
HELP: ...
[EMERGENCY_SUMMARY_END]

Then ask:
"Would you like to submit this report?"

Do not add anything outside this format in final stage."""}]
            }
          }
        );
        debugPrint("[Gemini Service] Success with model: $model");
        return data['candidates'][0]['content']['parts'][0]['text'];
      } catch (e) {
        lastError = e;
        debugPrint("[Gemini Service] Model $model failed: $e");
      }
    }
    debugPrint("[Gemini Service] All models failed in getChatResponse. Last error: $lastError");
    return "The AI is currently very busy. Please try sending your message again in a moment.";
  }

  Future<Map<String, dynamic>> getStructuredEmergencyData(String text) async {
    final prompt = """Extract structured emergency data from this text: "$text"
Return ONLY a JSON object with:
{
  "issue": string,
  "location": string,
  "urgency": "low" | "medium" | "high" | "critical",
  "number_of_people_affected": number,
  "volunteers_needed": number,
  "required_skills": string[],
  "image_keyword": string,
  "gps": {
    "lat": number,
    "lng": number
  }
}""";

    final models = ["gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];
    dynamic lastError;

    for (var model in models) {
      try {
        debugPrint("[Gemini Service] Attempting getStructuredEmergencyData with model: $model");
        final data = await _makeRequestWithRetry(
          model,
          {
            "contents": [{
              "parts": [{"text": prompt}]
            }],
            "generationConfig": {
              "responseMimeType": "application/json"
            }
          }
        );

        final rawText = data['candidates'][0]['content']['parts'][0]['text'];
        final cleaned = _cleanJsonResponse(rawText);
        debugPrint("[Gemini Service] Success with model: $model");
        return jsonDecode(cleaned);
      } catch (e) {
        lastError = e;
        debugPrint("[Gemini Service] Model $model failed: $e");
      }
    }
    throw Exception("Structuring Error: All models failed. Last error: $lastError");
  }

  Future<List<Map<String, dynamic>>> getPredictiveAnalysis(String location) async {
    final prompt = """Based on current news, weather patterns, and socio-economic trends for the region: "$location", predict 3 potential humanitarian needs or risks that might arise in the next 30 days. 
Return ONLY a JSON array of objects with:
{
  "title": string,
  "location": string,
  "description": string,
  "probability": string,
  "type": "weather" | "conflict" | "health" | "economic"
}""";

    final models = ["gemini-3.5-flash",
  "gemini-3.1-flash-lite"];
    dynamic lastError;

    for (var model in models) {
      try {
        debugPrint("[Gemini Service] Attempting getPredictiveAnalysis with model: $model");
        final data = await _makeRequestWithRetry(
          model,
          {
            "contents": [{
              "parts": [{"text": prompt}]
            }],
            "generationConfig": {
              "responseMimeType": "application/json"
            }
          }
        );

        String text = data['candidates'][0]['content']['parts'][0]['text'];
        final cleaned = _cleanJsonResponse(text);
        
        final startIndex = cleaned.indexOf('[');
        final endIndex = cleaned.lastIndexOf(']');
        String jsonText = cleaned;
        if (startIndex != -1 && endIndex != -1) {
          jsonText = cleaned.substring(startIndex, endIndex + 1);
        }
        
        final list = jsonDecode(jsonText);
        debugPrint("[Gemini Service] Success with model: $model");
        return List<Map<String, dynamic>>.from(list);
      } catch (e) {
        lastError = e;
        debugPrint("[Gemini Service] Model $model failed: $e");
      }
    }
    debugPrint("[Gemini Service] All models failed in getPredictiveAnalysis. Last error: $lastError");
    return [];
  }
}
