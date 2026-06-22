"use client";

export function AuroraBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {/* Grid */}
      <div className="absolute inset-0 grid-bg opacity-40" />

      {/* Aurora blobs */}
      <div
        className="absolute w-[900px] h-[700px] rounded-full animate-aurora"
        style={{
          top: "-20%",
          left: "-10%",
          background: "radial-gradient(ellipse at center, rgba(181,153,229,0.12) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute w-[700px] h-[600px] rounded-full animate-aurora-2"
        style={{
          top: "10%",
          right: "-15%",
          background: "radial-gradient(ellipse at center, rgba(110,231,255,0.1) 0%, rgba(56,189,248,0.05) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute w-[600px] h-[500px] rounded-full animate-aurora-3"
        style={{
          bottom: "0%",
          left: "30%",
          background: "radial-gradient(ellipse at center, rgba(167,139,250,0.08) 0%, rgba(181,153,229,0.04) 40%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(7,7,10,0.6) 100%)",
        }}
      />
    </div>
  );
}
