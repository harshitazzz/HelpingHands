import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import '../services/gemini_service.dart';
import '../theme/app_theme.dart';

class PredictionScreen extends StatefulWidget {
  const PredictionScreen({super.key});

  @override
  State<PredictionScreen> createState() => _PredictionScreenState();
}

class _PredictionScreenState extends State<PredictionScreen> {
  final TextEditingController _locationController = TextEditingController(text: "Global");
  List<Map<String, dynamic>> _predictions = [];
  bool _isLoading = false;
  bool _isDetectingLocation = false;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  Future<void> _initLocation() async {
    await _detectLocation();
  }

  Future<void> _detectLocation() async {
    setState(() => _isDetectingLocation = true);
    try {
      Position position = await _determinePosition();
      String? city = await _getCityName(position);
      if (city != null) {
        setState(() {
          _locationController.text = city;
        });
        _fetchPredictions();
      } else {
        _fetchPredictions(); // Fetch default "Global" if city fails
      }
    } catch (e) {
      debugPrint("Location detection error: $e");
      _fetchPredictions(); // Fallback to current text (Global)
    } finally {
      setState(() => _isDetectingLocation = false);
    }
  }

  Future<Position> _determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return Future.error('Location services are disabled.');

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return Future.error('Location permissions are denied');
    }
    
    if (permission == LocationPermission.deniedForever) {
      return Future.error('Location permissions are permanently denied.');
    }

    return await Geolocator.getCurrentPosition();
  }

  Future<String?> _getCityName(Position position) async {
    try {
      final url = Uri.parse('https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.latitude}&lon=${position.longitude}&zoom=10&addressdetails=1');
      final response = await http.get(url, headers: {
        'User-Agent': 'HelpingHands_Mobile_App'
      });

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final address = data['address'];
        return address['city'] ?? address['town'] ?? address['village'] ?? address['suburb'] ?? address['state'];
      }
    } catch (e) {
       debugPrint("Reverse geocoding error: $e");
    }
    return null;
  }

  Future<void> _fetchPredictions() async {
    if (_locationController.text.isEmpty) return;
    
    setState(() => _isLoading = true);
    try {
      final gemini = Provider.of<GeminiService>(context, listen: false);
      final results = await gemini.getPredictiveAnalysis(_locationController.text);
      setState(() => _predictions = results);
    } catch (e) {
      debugPrint("Prediction error: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<List<String>> _getAutocompleteSuggestions(String query) async {
    if (query.length < 3) return [];
    
    try {
      final url = Uri.parse('https://nominatim.openstreetmap.org/search?q=$query&format=json&limit=5&addressdetails=1');
      final response = await http.get(url, headers: {
        'User-Agent': 'HelpingHands_Mobile_App'
      });

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.map((item) {
          final address = item['address'];
          final city = address['city'] ?? address['town'] ?? address['village'] ?? address['suburb'] ?? "Unknown";
          final country = address['country'] ?? "";
          return "$city, $country";
        }).toSet().toList(); // Unique suggestions
      }
    } catch (e) {
      debugPrint("Autocomplete error: $e");
    }
    return [];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(top: 24, left: 16, right: 16, bottom: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              "What's next for your area?",
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                fontSize: 32,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              "HelpingHands uses AI to hint at the kinds of risks communities may need to prepare for next.",
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: const Color(0xFF475569),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 32),

            // Location Search
            _buildLocationInput(),
            const SizedBox(height: 32),

            // Results Section
            if (_isLoading)
               const Center(child: Padding(
                 padding: EdgeInsets.all(40.0),
                 child: CircularProgressIndicator(),
               ))
            else if (_predictions.isEmpty)
               const Center(child: Text("Provide a location to see preparedness tags."))
            else
              ..._predictions.map((p) => _buildPredictionCard(p)),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationInput() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glassDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "CHOOSE A LOCALITY",
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 16),
          Autocomplete<String>(
            optionsBuilder: (TextEditingValue textEditingValue) {
              return _getAutocompleteSuggestions(textEditingValue.text);
            },
            onSelected: (String selection) {
              _locationController.text = selection;
              _fetchPredictions();
            },
            fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
              // Sync our controller with autocomplete controller
              if (_locationController.text != controller.text && _locationController.text != "Global") {
                controller.text = _locationController.text;
              }
              
              return TextField(
                controller: controller,
                focusNode: focusNode,
                decoration: InputDecoration(
                  hintText: "Enter city or region...",
                  prefixIcon: const Icon(Icons.location_on_outlined, color: AppTheme.primaryColor),
                  suffixIcon: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_isDetectingLocation)
                        const Padding(
                          padding: EdgeInsets.all(12.0),
                          child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                        )
                      else
                        IconButton(
                          onPressed: () async {
                             await _detectLocation();
                             controller.text = _locationController.text;
                          },
                          icon: const Icon(Icons.my_location_rounded, color: Color(0xFF648197)),
                          tooltip: "Detect Current Location",
                        ),
                      IconButton(
                        onPressed: () {
                          _locationController.text = controller.text;
                          _fetchPredictions();
                        },
                        icon: const Icon(Icons.search_rounded, color: AppTheme.primaryColor),
                      ),
                    ],
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                ),
                onSubmitted: (value) {
                  _locationController.text = value;
                  _fetchPredictions();
                  onFieldSubmitted();
                },
              );
            },
            optionsViewBuilder: (context, onSelected, options) {
              return Align(
                alignment: Alignment.topLeft,
                child: Material(
                  elevation: 4,
                  borderRadius: BorderRadius.circular(16),
                  color: Colors.white,
                  child: Container(
                    width: MediaQuery.of(context).size.width - 72,
                    constraints: const BoxConstraints(maxHeight: 250),
                    child: ListView.builder(
                      padding: EdgeInsets.zero,
                      shrinkWrap: true,
                      itemCount: options.length,
                      itemBuilder: (BuildContext context, int index) {
                        final String option = options.elementAt(index);
                        return ListTile(
                          title: Text(option, style: const TextStyle(fontSize: 14)),
                          leading: const Icon(Icons.location_city_rounded, size: 18, color: Color(0xFF94A3B8)),
                          onTap: () => onSelected(option),
                        );
                      },
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPredictionCard(Map<String, dynamic> data) {
    IconData icon;
    Color color;

    switch (data['type']) {
      case 'weather':
        icon = Icons.cloudy_snowing;
        color = const Color(0xFF4F8AB2);
        break;
      case 'conflict':
        icon = Icons.shield_outlined;
        color = const Color(0xFFD07166);
        break;
      case 'health':
        icon = Icons.local_hospital_outlined;
        color = const Color(0xFF45A589);
        break;
      case 'economic':
        icon = Icons.attach_money_rounded;
        color = const Color(0xFFC58F3A);
        break;
      default:
        icon = Icons.info_outline;
        color = const Color(0xFF64748B);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(24),
      decoration: AppTheme.glassDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F3FF),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  "${data['probability']}% CHANCE",
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF49789A),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            data['title'] ?? "",
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            "Predictive tag for ${data['location']}",
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              color: Color(0xFF94A3B8),
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            data['description'] ?? "",
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFF475569),
              height: 1.6,
            ),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(Icons.trending_up, color: AppTheme.primaryColor, size: 18),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    "This area shows early signals of ${data['type']} risk.",
                    style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
