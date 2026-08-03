import { useEffect } from 'react';
import LandingNav from '../../components/LandingV2/LandingNav';
import Hero from '../../components/LandingV2/Hero';
import Ecosystem from '../../components/LandingV2/Ecosystem';
import Modules from '../../components/LandingV2/Modules';
import OpenSource from '../../components/LandingV2/OpenSource';
import FaqSection from '../../components/LandingV2/FaqSection';
import Roadmap from '../../components/LandingV2/Roadmap';
import FinalCta from '../../components/LandingV2/FinalCta';
import Footer from '../../components/LandingV2/Footer';
import { SEO } from '../../components/SEO';
import { getGsap } from '../../components/LandingV2/useLandingGsap';
import '../../components/LandingV2/landing.css';

function LandingPage() {
  useEffect(() => {
    // Hash links (e.g. /#open-source) need a nudge once the page has mounted.
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth' }));
      }
    }
    // Refresh MUSI iść po doładowaniu GSAP — wcześniej pozycje ScrollTriggerów
    // policzyłyby się, zanim jakikolwiek trigger w ogóle powstał.
    void getGsap().then((lib) => lib?.ScrollTrigger.refresh());
  }, []);

  return (
    <div className="lp min-h-screen antialiased">
      <SEO
        title="Budżet domowy, oszczędności i inwestycje w jednym miejscu"
        description="SmartPortfel to polska aplikacja do zarządzania budżetem domowym. Śledź wydatki, inwestycje i kredyty w jednym miejscu. Zacznij za darmo!"
        url="/"
      />
      <LandingNav />
      <main>
        <Hero />
        <Ecosystem />
        <Modules />
        <OpenSource />
        <FaqSection />
        <Roadmap />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
