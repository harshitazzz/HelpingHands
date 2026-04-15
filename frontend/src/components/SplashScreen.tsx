import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HandHelping, Heart, Shield, Sparkles } from 'lucide-react';

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setStep(1), 1000); // Show Name
    const timer2 = setTimeout(() => setStep(2), 2500); // Show Tagline
    const timer3 = setTimeout(() => onFinish(), 4500); // Fade Out

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onFinish]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FCFDF7] overflow-hidden"
    >
      {/* Background Decorative Elements */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.4, scale: 1.2 }}
        transition={{ duration: 4, repeat: Infinity, repeatType: "reverse" }}
        className="absolute -top-20 -left-20 w-96 h-96 bg-[#DCFCE7] rounded-full blur-[100px]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.4, scale: 1.2 }}
        transition={{ duration: 5, repeat: Infinity, repeatType: "reverse", delay: 1 }}
        className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#DBEAFE] rounded-full blur-[100px]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.3, scale: 1.1 }}
        transition={{ duration: 6, repeat: Infinity, repeatType: "reverse", delay: 2 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#FEF9C3] rounded-full blur-[120px]"
      />

      <div className="relative z-10 text-center space-y-8 px-6">
        {/* Logo Icon */}
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mx-auto bg-primary w-24 h-24 rounded-[2.5rem] shadow-2xl shadow-primary/20 flex items-center justify-center relative overflow-hidden group"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <HandHelping className="w-12 h-12 text-white" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1 }}
            className="absolute inset-0 bg-white/20 backdrop-blur-sm"
          />
        </motion.div>

        {/* Brand Name */}
        <div className="overflow-hidden">
          <AnimatePresence>
            {step >= 1 && (
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-2"
              >
                <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-slate-900 leading-none">
                  Helping <span className="text-primary">Hands</span>
                </h1>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent mx-auto max-w-[200px]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tagline */}
        <div className="h-12 flex items-center justify-center">
          <AnimatePresence>
            {step >= 1 && (
              <motion.p
                initial={{ opacity: 0, filter: "blur(10px)", y: 10 }}
                animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="text-lg md:text-xl font-medium text-slate-600 max-w-md mx-auto leading-relaxed"
              >
                "Because every need deserves the <span className="text-primary font-bold">right help</span> at the <span className="text-secondary-foreground font-bold">right time</span>"
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Loading Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.5 }}
          className="pt-8"
        >
          <div className="flex items-center justify-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="w-2 h-2 bg-primary rounded-full shadow-sm shadow-primary/50"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
              className="w-2 h-2 bg-[#DBEAFE] rounded-full shadow-sm"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
              className="w-2 h-2 bg-[#FEF9C3] rounded-full shadow-sm"
            />
          </div>
        </motion.div>
      </div>

      {/* Floating Icons */}
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 opacity-20"
      >
        <Heart className="w-8 h-8 text-red-400" />
      </motion.div>
      <motion.div
        animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        className="absolute bottom-1/4 right-1/4 opacity-20"
      >
        <Shield className="w-10 h-10 text-blue-400" />
      </motion.div>
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 right-1/3 text-yellow-500 opacity-20"
      >
        <Sparkles className="w-12 h-12" />
      </motion.div>
    </motion.div>
  );
}
