import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

class GeminiService {
  final String apiKey;
  static const String _baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

  GeminiService({required this.apiKey});

  Future<Map<String, dynamic>> _makeRequestWithRetry(Map<String, dynamic> body, {int retries = 3}) async {
    final url = Uri.parse("$_baseUrl?key=$apiKey");
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

  Future<String> getChatResponse(String message, List<Map<String, String>> history) async {
    final contents = history.map((m) => {
      "role": m['role'] == "model" ? "model" : "user",
      "parts": [{"text": m['content']}]
    }).toList();
    
    contents.add({
      "role": "user",
      "parts": [{"text": message}]
    });

    try {
      final data = await _makeRequestWithRetry({
        "contents": contents,
        "systemInstruction": {
          "role": "system",
          "parts": [{"text": """You are Helping Hands, an AI assistant for an NGO platform. 
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
After the summary, ask the user if they'd like to submit this report."""}]
        }
      });

      return data['candidates'][0]['content']['parts'][0]['text'];
    } catch (e) {
      debugPrint("Gemini Chat Error: $e");
      return "The AI is currently very busy. Please try sending your message again in a moment.";
    }
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
  "image_keyword": string
}""";

    try {
      final data = await _makeRequestWithRetry({
        "contents": [{
          "parts": [{"text": prompt}]
        }]
      });

      return jsonDecode(data['candidates'][0]['content']['parts'][0]['text']);
    } catch (e) {
      debugPrint("Structuring Error: $e");
      rethrow;
    }
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

    try {
      final data = await _makeRequestWithRetry({
        "contents": [{
          "parts": [{"text": prompt}]
        }]
      });

      String text = data['candidates'][0]['content']['parts'][0]['text'];
      
      final startIndex = text.indexOf('[');
      final endIndex = text.lastIndexOf(']');
      if (startIndex != -1 && endIndex != -1) {
        text = text.substring(startIndex, endIndex + 1);
      }
      
      final list = jsonDecode(text);
      return List<Map<String, dynamic>>.from(list);
    } catch (e) {
      debugPrint("Predictive analysis error: $e");
      return [];
    }
  }
}
