"use client";

/**
 * Traits abstraits gris sur le fond + point lumineux qui se déplace le long.
 * Utilise SVG <animateMotion> pour que le point suive exactement le tracé.
 */
export function BackgroundLines() {
  // Chaque ligne : un path SVG abstrait (segments droits angulaires)
  // + durée du point lumineux + opacité du trait
  const lines = [
    {
      d: "M -50 120 L 300 80 L 620 140 L 900 60 L 1200 110 L 1600 70",
      opacity: 0.18,
      dotDur: "12s",
      dotDelay: "0s",
    },
    {
      d: "M -50 320 L 200 280 L 500 350 L 750 260 L 1050 330 L 1400 250 L 1700 300",
      opacity: 0.14,
      dotDur: "15s",
      dotDelay: "-4s",
    },
    {
      d: "M -50 520 L 250 480 L 480 540 L 700 460 L 1000 530 L 1300 440 L 1650 500",
      opacity: 0.16,
      dotDur: "10s",
      dotDelay: "-2s",
    },
    {
      d: "M -50 720 L 350 670 L 600 740 L 850 660 L 1100 720 L 1500 650 L 1700 700",
      opacity: 0.12,
      dotDur: "14s",
      dotDelay: "-7s",
    },
    {
      d: "M -50 920 L 200 880 L 550 950 L 800 870 L 1150 930 L 1400 860 L 1700 910",
      opacity: 0.15,
      dotDur: "11s",
      dotDelay: "-5s",
    },
  ];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        {/* Halo lumineux autour du point */}
        <radialGradient id="dotGlow">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="30%" stopColor="#5E96B0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#5E96B0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {lines.map((line, i) => (
        <g key={i}>
          {/* Le trait gris visible */}
          <path
            d={line.d}
            fill="none"
            stroke="#7898AC"
            strokeWidth="1"
            strokeOpacity={line.opacity}
          />

          {/* Point lumineux qui parcourt le trait */}
          <circle r="6" fill="url(#dotGlow)">
            <animateMotion
              dur={line.dotDur}
              begin={line.dotDelay}
              repeatCount="indefinite"
              path={line.d}
            />
          </circle>

          {/* Petit noyau brillant au centre du point */}
          <circle r="2" fill="#ffffff" fillOpacity="0.8">
            <animateMotion
              dur={line.dotDur}
              begin={line.dotDelay}
              repeatCount="indefinite"
              path={line.d}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}
