import PublicCalculatorPage from '../components/calculators/PublicCalculatorPage';
import PpkCalculator from '../components/ppk/PpkCalculator';
import { SAVINGS_PPK_PAGES } from './savingsPpkContent';

const related = [
    { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
    { path: '/kalkulator-oszczednosci', label: 'Kalkulator oszczędności' },
    { path: '/kalkulator-wynagrodzen', label: 'Kalkulator wynagrodzeń' },
    { path: '/kalkulator-kredytu', label: 'Kalkulator kredytu' },
];

/** Publiczna strona kalkulatora PPK — magnes SEO, CTA na dashboard PPK (PRO). */
export default function PpkCalculatorPage() {
    return (
        <PublicCalculatorPage content={SAVINGS_PPK_PAGES.ppk} related={related}>
            <PpkCalculator />
        </PublicCalculatorPage>
    );
}
