import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// TARGET SCHEMA (Firestore map):
///   { "address": "Hisar, Haryana", "latitude": 29.1492, "longitude": 75.7217 }
///
/// This service handles:
///   1. Forward geocoding  (city name → coordinates)  via Nominatim
///   2. Reverse geocoding  (GPS coords → readable address)
///   3. Normalising any stored location (string or map) to the canonical shape
///   4. Haversine distance calculations
///   5. Google Maps URL builder

class GeocodingService {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Forward geocode: address string → canonical location map
  // ─────────────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> geocodeAddress(String address) async {
    if (address.trim().isEmpty) {
      return {'address': 'Unknown', 'latitude': null, 'longitude': null};
    }

    final trimmed = address.trim();
    debugPrint('[GEOCODE] Geocoding: "$trimmed"');

    try {
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/search?q=${Uri.encodeComponent(trimmed)}&format=json&limit=1',
      );
      final res = await http.get(
        uri,
        headers: {'Accept-Language': 'en', 'User-Agent': 'HelpingHandsNGO/1.0'},
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final List data = jsonDecode(res.body);
        if (data.isNotEmpty) {
          final lat = double.tryParse(data[0]['lat'].toString());
          final lon = double.tryParse(data[0]['lon'].toString());
          final displayName = (data[0]['display_name'] as String?) ?? trimmed;
          final shortName = displayName.split(',').take(2).join(',').trim();
          debugPrint('[GEOCODE] Result: $shortName ($lat, $lon)');
          return {
            'address': shortName.isNotEmpty ? shortName : trimmed,
            'latitude': lat,
            'longitude': lon,
          };
        }
      }
      debugPrint('[GEOCODE] No results for "$trimmed"');
    } catch (e) {
      debugPrint('[GEOCODE] Error: $e');
    }

    return {'address': trimmed, 'latitude': null, 'longitude': null};
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Reverse geocode: GPS coords → canonical location map
  // ─────────────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> reverseGeocode(
    double lat,
    double lon,
  ) async {
    debugPrint('[REVERSE_GEOCODE] Resolving ($lat, $lon)');
    try {
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lon',
      );
      final res = await http.get(
        uri,
        headers: {'Accept-Language': 'en', 'User-Agent': 'HelpingHandsNGO/1.0'},
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final Map<String, dynamic> body = jsonDecode(res.body);
        final addr = (body['address'] as Map?)?.cast<String, dynamic>() ?? {};
        final city  = addr['city'] ?? addr['town'] ?? addr['village'] ?? addr['suburb'] ?? '';
        final state = addr['state'] ?? '';
        final address = (city.isNotEmpty && state.isNotEmpty)
            ? '$city, $state'
            : city.isNotEmpty
                ? city as String
                : state.isNotEmpty
                    ? state as String
                    : '${lat.toStringAsFixed(4)}, ${lon.toStringAsFixed(4)}';
        debugPrint('[REVERSE_GEOCODE] Resolved: $address');
        return {'address': address, 'latitude': lat, 'longitude': lon};
      }
    } catch (e) {
      debugPrint('[REVERSE_GEOCODE] Error: $e');
    }

    return {
      'address': '${lat.toStringAsFixed(4)}, ${lon.toStringAsFixed(4)}',
      'latitude': lat,
      'longitude': lon,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Normalise ANY stored location value → canonical map
  //    Accepts: string | Map{address,latitude,longitude} | Map{lat,lng} | null
  // ─────────────────────────────────────────────────────────────────────────
  static Map<String, dynamic> extractLocationObject(dynamic raw) {
    if (raw == null) {
      return {'address': 'Unknown', 'latitude': null, 'longitude': null};
    }

    // Already canonical
    if (raw is Map && raw.containsKey('address')) {
      return {
        'address': raw['address'] ?? 'Unknown',
        'latitude': raw['latitude'],
        'longitude': raw['longitude'],
      };
    }

    // Plain string (old format)
    if (raw is String) {
      return {'address': raw, 'latitude': null, 'longitude': null};
    }

    // Map with lat/lng keys (legacy GPS object)
    if (raw is Map && raw.containsKey('lat') && raw.containsKey('lng')) {
      return {
        'address': '${raw['lat']}, ${raw['lng']}',
        'latitude': (raw['lat'] as num?)?.toDouble(),
        'longitude': (raw['lng'] as num?)?.toDouble(),
      };
    }

    // Map with latitude/longitude but no address
    if (raw is Map && raw.containsKey('latitude') && raw.containsKey('longitude')) {
      return {
        'address': '${raw['latitude']}, ${raw['longitude']}',
        'latitude': (raw['latitude'] as num?)?.toDouble(),
        'longitude': (raw['longitude'] as num?)?.toDouble(),
      };
    }

    return {'address': 'Unknown', 'latitude': null, 'longitude': null};
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Human-readable address string from any format
  // ─────────────────────────────────────────────────────────────────────────
  static String getLocationDisplay(dynamic raw) {
    final loc = extractLocationObject(raw);
    final addr = loc['address'] as String? ?? '';
    return addr.isNotEmpty ? addr : 'Location Unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Extract lat/lng from any format (returns null if coords unavailable)
  // ─────────────────────────────────────────────────────────────────────────
  static ({double lat, double lng})? getLocationCoords(dynamic raw) {
    final loc = extractLocationObject(raw);
    final latRaw = loc['latitude'];
    final lngRaw = loc['longitude'];
    if (latRaw != null && lngRaw != null) {
      return (
        lat: (latRaw as num).toDouble(),
        lng: (lngRaw as num).toDouble(),
      );
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Haversine distance in kilometres between two coordinates
  // ─────────────────────────────────────────────────────────────────────────
  static double haversineDistance(
    double lat1, double lon1,
    double lat2, double lon2,
  ) {
    const r = 6371.0; // Earth radius in km
    final dLat = _toRad(lat2 - lat1);
    final dLon = _toRad(lon2 - lon1);
    final a = math.pow(math.sin(dLat / 2), 2) +
        math.cos(_toRad(lat1)) *
            math.cos(_toRad(lat2)) *
            math.pow(math.sin(dLon / 2), 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return r * c;
  }

  static double _toRad(double deg) => deg * math.pi / 180.0;

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Distance-based scoring bonus (mirrors the frontend matching.ts logic)
  // ─────────────────────────────────────────────────────────────────────────
  static double distanceBonus(dynamic volunteerLoc, dynamic requestLoc) {
    final vCoords = getLocationCoords(volunteerLoc);
    final rCoords = getLocationCoords(requestLoc);

    if (vCoords != null && rCoords != null) {
      final dist = haversineDistance(
        vCoords.lat, vCoords.lng,
        rCoords.lat, rCoords.lng,
      );
      debugPrint('[DISTANCE] ${getLocationDisplay(volunteerLoc)} → ${getLocationDisplay(requestLoc)}: ${dist.toStringAsFixed(1)} km');
      if (dist < 10)  return 0.5;
      if (dist < 25)  return 0.3;
      if (dist < 50)  return 0.1;
      return 0.0;
    }

    // Fallback: text-based
    final vAddr = getLocationDisplay(volunteerLoc).toLowerCase();
    final rAddr = getLocationDisplay(requestLoc).toLowerCase();
    if (vAddr != 'unknown' && rAddr != 'unknown' &&
        (vAddr.contains(rAddr) || rAddr.contains(vAddr))) {
      return 0.2;
    }
    return 0.0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Build Google Maps URL from any location formats
  // ─────────────────────────────────────────────────────────────────────────
  static String buildMapsUrl(dynamic destination, {dynamic origin}) {
    final destCoords = getLocationCoords(destination);
    final destStr = destCoords != null
        ? '${destCoords.lat},${destCoords.lng}'
        : Uri.encodeComponent(getLocationDisplay(destination));

    if (origin != null) {
      final origCoords = getLocationCoords(origin);
      if (origCoords != null) {
        return 'https://www.google.com/maps/dir/?api=1&origin=${origCoords.lat},${origCoords.lng}&destination=$destStr&travelmode=driving';
      }
      final origAddr = Uri.encodeComponent(getLocationDisplay(origin));
      return 'https://www.google.com/maps/dir/?api=1&origin=$origAddr&destination=$destStr&travelmode=driving';
    }

    return 'https://www.google.com/maps/dir/?api=1&destination=$destStr&travelmode=driving';
  }
}
