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
    <div className="space-y-12">
      <div className="relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#E0F2FE]/40 to-[#DCFCE7]/40 blur-3xl -z-10 opacity-60" />
        <div className="glass p-10 rounded-[3rem] border-white/50 shadow-2xl shadow-slate-200/50">
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <Brain className="w-48 h-48" />
          </div>
          
          <div className="relative z-10 space-y-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-primary mb-4">
                <Brain className="w-6 h-6" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">AI Intelligence Unit</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900 leading-tight">Predictive Humanitarian Insights</h2>
              <p className="text-slate-500 mt-4 text-lg font-medium leading-relaxed">
                Anticipating community needs through real-time analysis of global news, weather patterns, and socio-economic trends.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-stretch md:items-center">
              <div className="relative flex-1">
                <div className="relative group/search">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within/search:text-primary transition-colors" />
                  <Input 
                    placeholder="Search region, city or country..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-14 rounded-2xl h-16 border-slate-200 focus-visible:ring-primary bg-white/80 backdrop-blur-sm text-lg font-medium shadow-sm"
                  />
                </div>
                
                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute top-full left-0 right-0 mt-3 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 z-[100] overflow-hidden p-2"
                    >
                      <div className="max-h-[350px] overflow-y-auto">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => handleSelectLocation(s)}
                            className="w-full text-left px-6 py-4 hover:bg-slate-50 rounded-2xl text-sm flex items-center gap-4 transition-all group/item"
                          >
                            <div className="bg-slate-100 p-3 rounded-xl group-hover/item:bg-primary/10 transition-colors">
                              <MapPin className="w-5 h-5 text-slate-400 group-hover/item:text-primary" />
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="font-black text-slate-900 text-base">{s.display_name.split(',')[0]}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{s.display_name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <div className="flex items-center gap-4 bg-white/60 backdrop-blur-md px-8 py-4 rounded-[1.5rem] border border-white shadow-sm self-start md:self-auto">
                <Navigation className="w-5 h-5 text-primary animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Region</span>
                  <span className="text-base font-black text-slate-900">{location}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-72 bg-white/50 border border-slate-100 animate-pulse rounded-[2.5rem]" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {predictions.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Card className="h-full border-none shadow-xl hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] overflow-hidden bg-white group hover:-translate-y-2">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-primary/10 transition-colors">
                      {getTypeIcon(p.type)}
                    </div>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 rounded-full px-4 py-1 font-black text-[10px]">
                      {p.probability}% PROBABILITY
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-black text-slate-900 leading-tight group-hover:text-primary transition-colors">{p.title}</CardTitle>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">
                    <MapPin className="w-3 h-3 text-primary" /> {p.location}
                  </div>
                </CardHeader>
                <CardContent className="p-8 pt-4 space-y-6">
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {p.description}
                  </p>
                  <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary opacity-30" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Live Trend Analysis</span>
                    </div>
                    <TrendingUp className="w-5 h-5 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <motion.div 
        whileHover={{ scale: 1.01 }}
        className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[100px] -mr-32 -mt-32 group-hover:bg-primary/30 transition-colors duration-700" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 text-center md:text-left">
            <h3 className="text-3xl font-black tracking-tight">Proactive Response Network</h3>
            <p className="text-slate-400 text-lg font-medium max-w-xl">
              Don't wait for the emergency. Join our early warning team and help communities prepare before crises arrive.
            </p>
          </div>
          <Button className="bg-primary hover:bg-primary/90 text-white h-16 px-12 rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all active:scale-95 whitespace-nowrap">
            Enroll in Early Response
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
