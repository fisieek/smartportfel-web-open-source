import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { TransactionFiltersProvider } from './context/TransactionFiltersContext';

// Route-level code-splitting (FAZA 3 audytu SEO/CWV).
// Cel: ciężkie ekrany dashboardu (recharts/xlsx/framer-motion/ai) NIE trafiają do
// bundla odwiedzającego landing — każda trasa to osobny chunk ładowany na żądanie.
const Layout = lazy(() => import('./layouts/Layout'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Budget = lazy(() => import('./pages/Budget'));
const Transactions = lazy(() => import('./pages/Transactions'));
const PersonalAccounts = lazy(() => import('./pages/PersonalAccounts'));
const Savings = lazy(() => import('./pages/Savings'));
const Investments = lazy(() => import('./pages/Investments'));
const Settings = lazy(() => import('./pages/Settings'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Mortgage = lazy(() => import('./pages/Mortgage'));
const PPKDashboard = lazy(() => import('./pages/PPKDashboard'));
const LandingPageContainer = lazy(() => import('./pages/LandingPage/LandingPageContainer'));
const LoanCalculatorPage = lazy(() => import('./pages/LoanCalculatorPage'));
const CalculatorsPage = lazy(() => import('./pages/CalculatorsPage'));
const SalaryCalculatorPage = lazy(() => import('./pages/SalaryCalculatorPage'));
const SavingsCalculatorPage = lazy(() => import('./pages/SavingsCalculatorPage'));
const PpkCalculatorPage = lazy(() => import('./pages/PpkCalculatorPage'));
const CreditCapacityCalculatorPage = lazy(() => import('./pages/CreditCapacityCalculatorPage'));
const LoanOverpaymentCalculatorPage = lazy(() => import('./pages/LoanOverpaymentCalculatorPage'));
const InvitationPage = lazy(() => import('./pages/InvitationPage'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OAuthConsent = lazy(() => import('./pages/OAuthConsent'));
const CategorySettings = lazy(() => import('./pages/CategorySettings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));

// Lekki fallback na czas ładowania chunku trasy.
// Tło musi być zgodne z globalnym `html, body` (#0B0B0F z index.css) — wcześniejsze
// `bg-white` dawało sekwencję biały → biały spinner → ciemna strona przy każdym wejściu.
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/70" />
    </div>
  );
}

function App() {
  return (
    <CurrencyProvider>
      <ToastProvider>
        <TransactionFiltersProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/" element={<LandingPageContainer />} />
          <Route path="/regulamin" element={<TermsAndConditions />} />
          <Route path="/polityka-prywatnosci" element={<PrivacyPolicy />} />
          <Route path="/polityka-cookies" element={<CookiePolicy />} />
          <Route path="/kalkulator-kredytu" element={<LoanCalculatorPage />} />
          <Route path="/kalkulatory" element={<CalculatorsPage />} />
          <Route path="/kalkulator-wynagrodzen" element={<SalaryCalculatorPage mode="uop" />} />
          <Route path="/kalkulator-umowa-zlecenie" element={<SalaryCalculatorPage mode="zlecenie" />} />
          <Route path="/kalkulator-b2b" element={<SalaryCalculatorPage mode="b2b" />} />
          <Route path="/kalkulator-oszczednosci" element={<SavingsCalculatorPage />} />
          <Route path="/kalkulator-ppk" element={<PpkCalculatorPage />} />
          <Route path="/kalkulator-zdolnosci-kredytowej" element={<CreditCapacityCalculatorPage />} />
          <Route path="/kalkulator-nadplaty-kredytu" element={<LoanOverpaymentCalculatorPage />} />
          <Route path="/zaproszenie" element={<InvitationPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/oauth/consent" element={<OAuthConsent />} />

          <Route path="/dashboard" element={<Layout />}>
            <Route index element={<Budget />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="personal-accounts" element={<PersonalAccounts />} />
            <Route path="savings" element={<Savings />} />
            <Route path="osiagniecia" element={<Achievements />} />
            <Route path="investments" element={<Investments />} />
            <Route path="mortgage" element={<Mortgage />} />
            <Route path="ppk" element={<PPKDashboard />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/categories" element={<CategorySettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
        </TransactionFiltersProvider>
    </ToastProvider>
    </CurrencyProvider>
  );
}

export default App;
