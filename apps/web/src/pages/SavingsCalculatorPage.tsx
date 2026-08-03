import PublicCalculatorPage from '../components/calculators/PublicCalculatorPage';
import SavingsCalculator from '../components/savings/SavingsCalculator';
import { SAVINGS_PPK_PAGES } from './savingsPpkContent';

const related = [
    { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
    { path: '/kalkulator-ppk', label: 'Kalkulator PPK' },
    { path: '/kalkulator-wynagrodzen', label: 'Kalkulator wynagrodzeń' },
    { path: '/kalkulator-kredytu', label: 'Kalkulator kredytu' },
];

/** Publiczna strona kalkulatora oszczędności (konto / lokata) — magnes SEO. */
export default function SavingsCalculatorPage() {
    return (
        <PublicCalculatorPage content={SAVINGS_PPK_PAGES.oszczednosci} related={related}>
            <SavingsCalculator />
        </PublicCalculatorPage>
    );
}
