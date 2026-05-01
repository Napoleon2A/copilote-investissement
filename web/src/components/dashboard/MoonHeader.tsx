"use client";

/**
 * Header immersif avec ciel nocturne + Lune au centre + médaillon Napoléon.
 */

interface MoonHeaderProps {
  today: string;
}

export function MoonHeader({ today }: MoonHeaderProps) {
  return (
    <div className="relative h-[160px] sm:h-[180px] rounded-2xl overflow-hidden shadow-md"
      style={{
        background:
          "radial-gradient(ellipse at center, rgb(22, 38, 62) 0%, rgb(11, 25, 41) 70%, rgb(8, 18, 30) 100%)",
      }}>

      {/* Lune au centre — HD avec halo lunaire */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        {/* Halo lunaire externe */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(220,225,240,0.18) 0%, rgba(220,225,240,0.05) 45%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />
        {/* Halo proche */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[170px] h-[170px] sm:w-[200px] sm:h-[200px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(210,220,235,0.25) 0%, transparent 60%)",
            filter: "blur(4px)",
          }}
        />
        {/* La Lune en HD — wrapper pour zoom intérieur (exclure marges noires) */}
        <div
          className="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] rounded-full overflow-hidden"
          style={{
            boxShadow: "0 0 60px rgba(210,220,235,0.45), 0 0 30px rgba(210,220,235,0.3)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lune.jpg"
            alt="Pleine lune"
            className="w-full h-full object-cover"
            style={{
              transform: "scale(1.12)",
              filter: "brightness(1.1) contrast(1.05)",
            }}
          />
        </div>
      </div>

      {/* Étoiles SVG en background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <g fill="white">
          <circle cx="8%"  cy="20%" r="0.7" opacity="0.6" />
          <circle cx="15%" cy="55%" r="0.5" opacity="0.4" />
          <circle cx="22%" cy="80%" r="0.6" opacity="0.5" />
          <circle cx="30%" cy="30%" r="0.4" opacity="0.7" />
          <circle cx="42%" cy="15%" r="0.5" opacity="0.5" />
          <circle cx="65%" cy="85%" r="0.6" opacity="0.5" />
          <circle cx="75%" cy="22%" r="0.5" opacity="0.6" />
          <circle cx="82%" cy="60%" r="0.4" opacity="0.4" />
          <circle cx="90%" cy="35%" r="0.6" opacity="0.55" />
          <circle cx="55%" cy="92%" r="0.5" opacity="0.5" />
        </g>
      </svg>

      {/* Texture grain ultra subtile */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Liseré accent bas */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgb(var(--accent)) 30%, rgb(var(--accent)) 70%, transparent 100%)" }}
      />

      {/* Contenu */}
      <div className="relative h-full flex items-center justify-between px-6 sm:px-10">
        {/* Bloc gauche : titre + date */}
        <div className="flex items-center gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="w-12 h-[2px] bg-accent" />
            <span className="text-accent text-[0.625rem] tracking-[0.35em] uppercase font-semibold">
              Est. mmxxiii
            </span>
          </div>
          <div>
            <h1
              className="text-white text-2xl sm:text-3xl font-bold tracking-[0.02em] leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Tableau de bord
            </h1>
            <p className="text-white/70 text-xs sm:text-sm capitalize mt-1 tracking-wide">
              {today}
            </p>
          </div>
        </div>

        {/* Bloc droit : marque + médaillon Napoléon */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p
              className="text-white text-base sm:text-lg font-bold tracking-[0.18em] uppercase leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Austerlitz
            </p>
            <p className="text-accent text-[0.7rem] tracking-[0.3em] uppercase font-medium mt-1.5">
              Hedge Fund
            </p>
            <p className="text-white/40 text-[0.625rem] tracking-wider italic mt-1">
              Audace · Méthode · Patience
            </p>
          </div>

          {/* Médaillon Napoléon */}
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(94,150,176,0.45) 0%, transparent 70%)",
                transform: "scale(1.5)",
              }}
            />
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full p-[2px]"
              style={{
                background: "linear-gradient(135deg, rgb(var(--accent)) 0%, rgba(var(--accent), 0.4) 50%, rgb(var(--accent)) 100%)",
                boxShadow: "0 2px 10px rgba(11,25,41,0.4), inset 0 1px 1px rgba(255,255,255,0.15)",
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/napoleon.jpg"
                  alt="Bonaparte franchissant le Grand-Saint-Bernard — Jacques-Louis David"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: "50% 18%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Crédit tableau */}
      <p className="absolute bottom-1.5 right-3 text-white/25 text-[0.55rem] tracking-wide">
        David, 1801 · Domaine public
      </p>
    </div>
  );
}
