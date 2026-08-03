import PublicCalculatorPage from '../components/calculators/PublicCalculatorPage';
import CapacityCalculator from '../components/credit/CapacityCalculator';
import { CREDIT_PAGES } from './creditContent';

const related = [
    { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
    { path: '/kalkulator-nadplaty-kredytu', label: 'Kalkulator nadpłaty' },
    { path: '/kalkulator-kredytu', label: 'Kalkulator kredytu' },
    { path: '/kalkulator-wynagrodzen', label: 'Kalkulator wynagrodzeń' },
];

/** Publiczna strona kalkulatora zdolności kredytowej — magnes SEO. */
export default function CreditCapacityCalculatorPage() {
    return (
        <PublicCalculatorPage content={CREDIT_PAGES.zdolnosc} related={related}>
            <CapacityCalculator />
        </PublicCalculatorPage>
    );
}
