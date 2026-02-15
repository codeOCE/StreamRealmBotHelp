"use client";

import React from 'react';

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline';
    glow?: boolean;
}

export default function NeonButton({
    children,
    className = '',
    variant = 'primary',
    glow = true,
    ...props
}: NeonButtonProps) {
    const baseStyles = "px-6 py-2.5 rounded-full font-bold transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 text-sm";

    const variants = {
        primary: "bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-[0_0_20px_rgba(157,80,255,0.3)] hover:shadow-[0_0_30px_rgba(157,80,255,0.5)]",
        secondary: "bg-brand-lime text-black hover:bg-brand-lime/90 shadow-[0_0_20px_rgba(195,255,0,0.2)]",
        outline: "border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
