import React, { useState, useEffect, useCallback } from 'react';
import { getPredictiveAnalysis } from '@/src/lib/gemini';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Brain, MapPin, AlertCircle, TrendingUp, CloudRain, ShieldAlert, Activity, DollarSign, Search, Navigation, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function PredictiveTab() {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState('Global');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchPredictions = useCallback(async (loc: string, weatherData?: any) => {
    setLoading(true);
    try {
      const weatherContext = weatherData ? 
        `Current Weather: ${weatherData.temperature}°C, Condition: ${weatherData.condition}` : 
        'Weather data unavailable';
        
      const data = await getPredictiveAnalysis(`${loc}. ${weatherContext}`);
      setPredictions(data);
    } catch (error) {
      console.error("Failed to fetch predictions:", error);
      toast.error("Failed to generate AI insights for this location");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      const data = await res.json();
      return {
        temperature: data.current_weather.temperature,
        condition: data.current_weather.weathercode // Simplified
      };
    } catch (err) {
      return null;
    }
  };

  useEffect(() => {
    // Initial location detection
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const [geoRes, weather] = await Promise.all([
              fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`),
              fetchWeather(latitude, longitude)
            ]);
            const geoData = await geoRes.json();
            const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.state || 'Global';
            setLocation(city);
            fetchPredictions(city, weather);
          } catch (err) {
            fetchPredictions('Global');
          }
        },
        () => {
          fetchPredictions('Global');
        }
      );
    } else {
      fetchPredictions('Global');
    }
  }, [fetchPredictions]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 2) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
          const data = await res.json();
          setSuggestions(data);
        } catch (err) {
          console.error("Autocomplete error:", err);
        }
      } else {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectLocation = async (loc: any) => {
    const name = loc.display_name.split(',')[0];
    const lat = parseFloat(loc.lat);
    const lon = parseFloat(loc.lon);
    
    setLocation(name);
    setSearchQuery('');
    setSuggestions([]);
    
    const weather = await fetchWeather(lat, lon);
    fetchPredictions(name, weather);
    toast.success(`Showing insights for ${name}`);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'weather': return <CloudRain className="w-5 h-5 text-blue-500" />;
      case 'conflict': return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'health': return <Activity className="w-5 h-5 text-green-500" />;
      case 'economic': return <DollarSign className="w-5 h-5 text-yellow-600" />;
      default: return <AlertCircle className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Brain className="w-32 h-32" />
        </div>
        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Predictive Insights</h2>
            <p className="text-slate-500 mt-2 max-w-2xl">
              AI-driven humanitarian forecasting based on real-time news, weather, and socio-economic trends.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="relative flex-1 w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search for a region or city..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-2xl h-12 border-slate-200 focus:ring-primary bg-white"
                />
              </div>
              
              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 z-[100] overflow-hidden"
                  >
                    <div className="max-h-[300px] overflow-y-auto">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectLocation(s)}
                          className="w-full text-left px-5 py-4 hover:bg-slate-50 text-sm flex items-center gap-3 transition-colors border-b border-slate-100 last:border-none group"
                        >
                          <div className="bg-slate-100 p-2 rounded-lg group-hover:bg-primary/10 transition-colors">
                            <MapPin className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="font-bold text-slate-900 truncate">{s.display_name.split(',')[0]}</span>
                            <span className="text-[10px] text-slate-400 truncate">{s.display_name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100">
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-slate-700">Current: {location}</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-slate-100 animate-pulse rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {predictions.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="h-full border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-3xl overflow-hidden group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-primary/10 transition-colors">
                      {getTypeIcon(p.type)}
                    </div>
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                      {p.probability} Prob.
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-bold leading-tight">{p.title}</CardTitle>
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                    <MapPin className="w-3 h-3" /> {p.location}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {p.description}
                  </p>
                  <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Analysis</span>
                    <TrendingUp className="w-4 h-4 text-primary opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Card className="bg-slate-900 text-white border-none rounded-3xl overflow-hidden">
        <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Want to help prepare?</h3>
            <p className="text-slate-400 text-sm">Join our early response team to be notified as soon as these predictions reach critical status.</p>
          </div>
          <button className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-full font-bold transition-all whitespace-nowrap">
            Join Response Team
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
