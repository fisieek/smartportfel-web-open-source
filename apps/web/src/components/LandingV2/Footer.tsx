import './landing.css';

const columns = [
  {
    heading: 'Produkt',
    links: [
      { label: 'Ekosystem', href: '/#ecosystem' },
      { label: 'Moduły', href: '/#modules' },
      { label: 'Open source', href: '/#open-source' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
  {
    heading: 'Darmowe narzędzia',
    links: [
      { label: 'Wszystkie kalkulatory', href: '/kalkulatory' },
      { label: 'Kalkulator wynagrodzeń', href: '/kalkulator-wynagrodzen' },
      { label: 'Umowa zlecenie', href: '/kalkulator-umowa-zlecenie' },
      { label: 'Kalkulator B2B', href: '/kalkulator-b2b' },
      { label: 'Kalkulator oszczędności', href: '/kalkulator-oszczednosci' },
      { label: 'Kalkulator PPK', href: '/kalkulator-ppk' },
      { label: 'Zdolność kredytowa', href: '/kalkulator-zdolnosci-kredytowej' },
      { label: 'Nadpłata kredytu', href: '/kalkulator-nadplaty-kredytu' },
      { label: 'Kalkulator kredytu', href: '/kalkulator-kredytu' },
    ],
  },
  {
    heading: 'Prawne',
    links: [
      { label: 'Regulamin', href: '/regulamin' },
      { label: 'Polityka prywatności', href: '/polityka-prywatnosci' },
      { label: 'Polityka cookies', href: '/polityka-cookies' },
    ],
  },
];

function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#050507]">
      <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <a href="/" className="lp-display text-xl font-semibold text-white">
              Smart<span className="lp-gradient-text">Portfel</span>
            </a>
            <p className="mt-5 max-w-xs text-sm text-white/45 leading-relaxed">
              Polska aplikacja do zarządzania finansami osobistymi. Budżet,
              oszczędności, inwestycje i kredyty — w jednym miejscu.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.heading} className="md:col-span-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/35 mb-5">
                {col.heading}
              </p>
              <ul className="flex flex-col gap-3.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-white/60 hover:text-white transition-colors duration-300"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/35">
            © {new Date().getFullYear()} SmartPortfel. Wszelkie prawa zastrzeżone.
          </p>
          <p className="text-xs text-white/35">Tworzone w Polsce 🇵🇱</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
