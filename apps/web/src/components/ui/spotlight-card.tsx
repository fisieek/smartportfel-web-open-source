import React, { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'blue' | 'purple' | 'green' | 'red' | 'orange';
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 }
};

const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  glowColor = 'blue'
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e;

      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        // Set coordinates relative to the card for local radial gradient math if needed, 
        // but here we use fixed attachment for a shared spotlight feel across cards.
        cardRef.current.style.setProperty('--x', x.toFixed(2));
        cardRef.current.style.setProperty('--y', y.toFixed(2));
        cardRef.current.style.setProperty('--xp', ((x - rect.left) / rect.width).toFixed(2));
        cardRef.current.style.setProperty('--yp', ((y - rect.top) / rect.height).toFixed(2));
      }
    };

    document.addEventListener('pointermove', syncPointer);
    return () => document.removeEventListener('pointermove', syncPointer);
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  const getInlineStyles = () => {
    return {
      '--base': base,
      '--spread': spread,
      '--radius': '5', // Matches 5px rounding
      '--border': '1',
      '--backdrop': 'rgba(18, 18, 26, 0.4)', // Subtle surface tint
      '--size': '400',
      '--bg-spot-opacity': '0.05', // Gentle background glow
      '--border-spot-opacity': '0.4', // Subtle border spotlight
      '--hue': 'calc(var(--base) + (0.5 * var(--spread, 0)))', // Fixed hue or dynamic
      '--border-size': 'calc(var(--border) * 1px)',
      '--spotlight-size': 'calc(var(--size) * 1px)',
      position: 'relative' as const,
      touchAction: 'none' as const,
    };
  };

  const beforeAfterStyles = `
    @media (min-width: 768px) {
        [data-glow]::before,
        [data-glow]::after {
        pointer-events: none;
        content: "";
        position: absolute;
        inset: calc(var(--border-size) * -1);
        border: var(--border-size) solid transparent;
        border-radius: calc(var(--radius) * 1px);
        background-attachment: fixed;
        background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
        background-repeat: no-repeat;
        background-position: 50% 50%;
        mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
        mask-clip: padding-box, border-box;
        mask-composite: intersect;
        z-index: 10;
        }
        
        [data-glow]::before {
        background-image: radial-gradient(
            calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
            calc(var(--x, 0) * 1px)
            calc(var(--y, 0) * 1px),
            hsl(var(--base) 100% 70% / var(--border-spot-opacity, 1)), transparent 100%
        );
        }
        
        [data-glow]::after {
        background-image: radial-gradient(
            calc(var(--spotlight-size) * 0.5) calc(var(--spotlight-size) * 0.5) at
            calc(var(--x, 0) * 1px)
            calc(var(--y, 0) * 1px),
            hsl(var(--base) 100% 90% / 0.2), transparent 100%
        );
        }

        /* Inner highlights to blend with existing surface */
        .glow-content-overlay {
        position: absolute;
        inset: 0;
        border-radius: calc(var(--radius) * 1px);
        background-attachment: fixed;
        background-image: radial-gradient(
            var(--spotlight-size) var(--spotlight-size) at
            calc(var(--x, 0) * 1px)
            calc(var(--y, 0) * 1px),
            hsl(var(--base) 100% 70% / var(--bg-spot-opacity, 0.1)), transparent
        );
        pointer-events: none;
        z-index: 1;
        }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: beforeAfterStyles }} />
      <div
        ref={cardRef}
        data-glow
        style={getInlineStyles() as any}
        className={cn(
          "relative rounded-[5px] transition-colors duration-300",
          className
        )}
      >
        <div className="glow-content-overlay" />
        <div className="relative z-20 h-full w-full">
          {children}
        </div>
      </div>
    </>
  );
};

export { GlowCard };
