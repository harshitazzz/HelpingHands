import React, { useCallback, useEffect, useState } from 'react';
import { getPredictiveAnalysis } from '@/src/lib/gemini';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Brain, CloudRain, AlertCircle, TrendingUp, ShieldAlert, Activity, DollarSign, Search, Navigation, Loader2, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

function buildFallbackPredictions(location: string) {
  return [
    {
      title: 'Heat and dehydration support',
      location,
      description:
        'Warmer days can increase dehydration, heat fatigue, and demand for drinking water, shade, and first-response support in exposed neighborhoods.',
      probability: '68',
      type: 'weather',
    },
    {
      title: 'Medical supply strain',
      location,
      description:
        'If multiple complaints emerge together, local clinics and community responders may need more medicine delivery, transport help, and volunteer coordination.',
      probability: '57',
      type: 'health',
    },
    {
      title: 'Food and essentials assistance',
      location,
      description:
        'Economic pressure or localized disruption may increase requests for ration support, delivery help, and doorstep coordination for vulnerable families.',
      probability: '49',
      type: 'economic',
    },
  ];
}

export function PredictiveTab() {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState('Global');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const fetchPredictions = useCallback(async (loc: string, weatherData?: any) => {
    setLoading(true);
    try {
      const weatherContext = weatherData
        ? `Current Weather: ${weatherData.temperature}°C, Condition: ${weatherData.condition}`
        : 'Weather data unavailable';

      const data = await getPredictiveAnalysis(`${loc}. ${weatherContext}`);
      setPredictions(data);
    } catch (error) {
      console.error('Failed to fetch predictions:', error);
      setPredictions(buildFallbackPredictions(loc));
      toast.info('Showing preparedness tags for this location.');
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
        condition: data.current_weather.weathercode,
      };
    } catch (error) {
      console.error('Weather fetch error:', error);
      return null;
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const [geoResponse, weather] = await Promise.all([
              fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`),
              fetchWeather(latitude, longitude),
            ]);
            const geoData = await geoResponse.json();
            const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.state || 'Global';
            setLocation(city);
            fetchPredictions(city, weather);
          } catch (error) {
            console.error('Location init error:', error);
            fetchPredictions('Global');
          }
        },
        () => fetchPredictions('Global')
      );
    } else {
      fetchPredictions('Global');
    }
  }, [fetchPredictions]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchQuery.length > 2) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`
          );
          const data = await response.json();
          setSuggestions(data);
        } catch (error) {
          console.error('Autocomplete error:', error);
        }
      } else {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
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
      case 'weather':
        return <CloudRain className="h-5 w-5 text-[#4f8ab2]" />;
      case 'conflict':
        return <ShieldAlert className="h-5 w-5 text-[#d07166]" />;
      case 'health':
        return <Activity className="h-5 w-5 text-[#45a589]" />;
      case 'economic':
        return <DollarSign className="h-5 w-5 text-[#c58f3a]" />;
      default:
        return <AlertCircle className="h-5 w-5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="mesh-card rounded-[2.4rem] border border-white/80 p-8 shadow-[0_20px_60px_rgba(112,147,165,0.12)]">
          <Badge className="rounded-full bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#2e6c62]">
            <Brain className="mr-2 h-3.5 w-3.5" />
            Predictive tags
          </Badge>
          <h2 className="mt-5 font-heading text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            What issues may show up next in your area?
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
            This page gives users a predictive tag experience for their own location. Instead of waiting for a complaint to arrive, HelpingHands can hint at the kinds of risks communities may need to prepare for next.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              'Future risk cues',
              'Area-specific tags',
              'Preparedness planning',
            ].map((item) => (
              <div key={item} className="soft-panel rounded-[1.6rem] p-4">
                <p className="text-sm font-semibold text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="soft-panel rounded-[2.2rem] border-none">
          <CardHeader>
            <CardTitle className="font-heading text-2xl font-extrabold tracking-tight text-slate-900">Choose a locality</CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              Search for the area the user belongs to and the predictive tags below will update for that region.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or district..."
                className="h-14 rounded-full border-none bg-white/80 pl-11"
              />
            </div>

            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="overflow-hidden rounded-[1.6rem] border border-slate-100 bg-white"
                >
                  {suggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.place_id}-${suggestion.lat}`}
                      onClick={() => handleSelectLocation(suggestion)}
                      className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-4 text-left last:border-b-0 hover:bg-[#f6fbfa]"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#edf7f5] text-primary">
                        <Navigation className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{suggestion.display_name.split(',')[0]}</p>
                        <p className="truncate text-xs text-slate-500">{suggestion.display_name}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-[1.6rem] bg-white/75 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Current predictive region</p>
              <p className="mt-3 flex items-center gap-2 text-lg font-bold text-slate-900">
                <Navigation className="h-4 w-4 text-primary" />
                {location}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex h-64 items-center justify-center rounded-[2rem] bg-white/70">
              <Loader2 className="h-7 w-7 animate-spin text-primary/60" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {predictions.map((prediction, index) => (
            <motion.div
              key={`${prediction.title}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <Card className="h-full rounded-[2rem] border-none bg-white/88 shadow-xl shadow-slate-200/20 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl">
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4fbfa]">
                      {getTypeIcon(prediction.type)}
                    </div>
                    <Badge className="rounded-full bg-[#e8f3ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#49789a]">
                      {prediction.probability}% chance
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="font-heading text-2xl font-extrabold tracking-tight text-slate-900">{prediction.title}</CardTitle>
                    <CardDescription className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      Predictive tag for {prediction.location || location}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm leading-7 text-slate-600">{prediction.description}</p>
                  <div className="rounded-[1.4rem] bg-[#f5fbfa] p-4">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Why it matters
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      Teams in {prediction.location || location} can use this tag as an early signal to prepare supplies, volunteers, and local coordination.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
