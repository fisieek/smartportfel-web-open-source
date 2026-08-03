import PublicCalculatorPage from '../components/calculators/PublicCalculatorPage';
import OverpaymentCalculator from '../components/credit/OverpaymentCalculator';
import { CREDIT_PAGES } from './creditContent';

const related = [
    { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
    { path: '/kalkulator-zdolnosci-kredytowej', label: 'Kalkulator zdolności' },
    { path: '/kalkulator-kredytu', label: 'Kalkulator kredytu' },
    { path: '/kalkulator-oszczednosci', label: 'Kalkulator oszczędności' },
];

/** Publiczna strona kalkulatora nadpłaty kredytu — magnes SEO. */
export default function LoanOverpaymentCalculatorPage() {
    return (
        <PublicCalculatorPage content={CREDIT_PAGES.nadplata} related={related}>
            <OverpaymentCalculator />
        </PublicCalculatorPage>
    );
}
