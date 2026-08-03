import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { getGsap, useIsLoggedIn } from './useLandingGsap';
import './landing.css';

const navLinks = [
  { label: 'Ekosystem', href: '/#ecosystem' },
  { label: 'Moduły', href: '/#modules' },
  { label: 'Open source', href: '/#open-source' },
  { label: 'Kalkulatory', href: '/kalkulatory' },
];

function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoggedIn = useIsLoggedIn();
  const progressRef = useRef<HTMLDivElement>(null);
  const ctaHref = isLoggedIn ? '/dashboard' : '/register';

  useEffect(() => {
    const onScroll = () =>
      setIsScrolled(window.scrollY > 24 || window.location.pathname !== '/');
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Pasek postępu scrolla — ozdobnik, więc czeka na leniwie ładowany GSAP.
  useEffect(() => {
    if (!progressRef.current) return;
    let cancelled = false;
    let trigger: { kill: () => void } | null = null;

    void getGsap().then((lib) => {
      if (cancelled || !lib) return;
      trigger = lib.ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self: { progress: number }) => {
          lib.gsap.set(progressRef.current, { scaleX: self.progress });
        },
      });
    });

    return () => {
      cancelled = true;
      trigger?.kill();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const scrollToTop = (e: React.MouseEvent) => {
    if (window.location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      <div ref={progressRef} className="lp-progress" aria-hidden="true" />
      <nav
        className={`fixed top-0 inset-x-0 z-[9999] transition-all duration-500 ${
          menuOpen
            ? 'bg-[#050507]'
            : isScrolled
              // Rozmycie tła pod PRZYKLEJONYM paskiem to jedyny efekt, za który
              // płaci się w każdej klatce PRZEWIJANIA: pasek stoi na wierzchu, więc
              // każdy przesuwający się pod nim piksel trzeba na nowo przepuścić przez
              // blur. Na telefonie zamieniamy je na niemal nieprzezroczyste tło —
              // na tak ciemnej stronie różnicy nie widać, a scroll przestaje się ciąć.
              ? 'bg-[#050507]/95 sm:bg-[#050507]/70 sm:backdrop-blur-xl border-b border-white/[0.06]'
              : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 lg:py-5">
          <a
            href="/"
            onClick={scrollToTop}
            aria-label="SmartPortfel — strona główna"
            className="lp-display text-lg font-semibold tracking-tight text-white"
          >
            Smart<span className="lp-gradient-text">Portfel</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-white/60 hover:text-white transition-colors duration-300"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {!isLoggedIn && (
              <a
                href="/login"
                className="text-sm text-white/60 hover:text-white transition-colors duration-300 px-3 py-2"
              >
                Zaloguj się
              </a>
            )}
            <a href={ctaHref} className="lp-btn-primary text-sm px-5 py-2.5">
              {isLoggedIn ? 'Przejdź do aplikacji' : 'Zacznij za darmo'}
            </a>
          </div>

          <button
            className="md:hidden text-white p-2 relative z-[10000]"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 bg-[#050507] z-[9998] pt-28 px-8 flex flex-col gap-10">
          <div className="flex flex-col gap-7">
            {navLinks.map((link, i) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="lp-display text-3xl font-medium text-white/85 hover:text-white"
                style={{
                  animation: `lp-menu-in 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`,
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-4 mt-auto mb-12">
            {!isLoggedIn && (
              <a
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="lp-btn-ghost py-3.5 text-base"
              >
                Zaloguj się
              </a>
            )}
            <a
              href={ctaHref}
              onClick={() => setMenuOpen(false)}
              className="lp-btn-primary py-3.5 text-base"
            >
              {isLoggedIn ? 'Przejdź do aplikacji' : 'Zacznij za darmo'}
            </a>
          </div>
          <style>{`@keyframes lp-menu-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }`}</style>
        </div>
      )}
    </>
  );
}

export default LandingNav;
