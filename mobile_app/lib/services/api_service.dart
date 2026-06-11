import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';

class ApiService {
  static String get baseUrl => dotenv.env['API_URL'] ?? "https://helpinghands-l6s1.onrender.com";

  static Future<bool> checkHealth() async {
    try {
      final response = await http.get(Uri.parse("$baseUrl/health"));
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  static Future<Map<String, dynamic>> sendInvitation({
    required String email,
    required String name,
    required String location,
    required String issue,
    required String acceptLink,
    required String rejectLink,
  }) async {
    try {
      final response = await http.post(
        Uri.parse("$baseUrl/api/send-invitation"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "email": email,
          "name": name,
          "location": location,
          "issue": issue,
          "acceptLink": acceptLink,
          "rejectLink": rejectLink,
        }),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {"success": false, "message": e.toString()};
    }
  }
}
