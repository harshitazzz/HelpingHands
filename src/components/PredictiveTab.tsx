import React, { useState, useEffect } from 'react';
import { getPredictiveAnalysis } from '@/src/lib/gemini';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, MapPin, AlertCircle, TrendingUp, CloudRain, ShieldAlert, Activity, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';

export function PredictiveTab() {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPredictions() {
      try {
        const data = await getPredictiveAnalysis();
        setPredictions(data);
      } catch (error) {
        console.error("Failed to fetch predictions:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPredictions();
  }, []);

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
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Brain className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black tracking-tight text-slate-900">Predictive Insights</h2>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Our AI analyzes global news, weather patterns, and economic trends to predict potential humanitarian needs before they become crises.
          </p>
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
