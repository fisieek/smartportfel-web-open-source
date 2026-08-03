/**
 * Kalkulator wynagrodzeń brutto↔netto (UoP, zlecenie, B2B) — model MIESIĘCZNY.
 *
 * Świadome uproszczenia (v1, każde sygnalizowane w `warnings` gdy dotyczy wyniku):
 *  - próg podatkowy 120 000 zł/rok liczony miesięcznie (10 000 zł/mies.) — brak
 *    progresji narastającej; osoby przekraczające próg w trakcie roku dostają przybliżenie,
 *  - brak limitu 30-krotności składek emerytalno-rentowych (warning przy wysokich kwotach),
 *  - wpłata pracodawcy do PPK opodatkowana w tym samym miesiącu (realnie: miesiąc później),
 *  - ulga dla młodych (<26) = pełne zwolnienie z PIT; powyżej limitu rocznego tylko warning,
 *  - brak ograniczenia składki zdrowotnej do wysokości hipotetycznej zaliczki
 *    (art. 83 u.ś.o.z. — istotne przy niskich kwotach zlecenia; warning < 2000 zł),
 *  - zlecenie: zakładamy jedyny tytuł do ubezpieczeń (bez zbiegu tytułów), bez ryczałtu 200 zł.
 *
 * Konwencje zaokrągleń: składki do grosza (per pozycja), podstawa opodatkowania
 * i zaliczka PIT do pełnych złotych.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;
const roundZl = (value: number) => Math.round(value);

// ─── Parametry roczne ───

export interface B2bParams {
    /** Stawki składek społecznych przedsiębiorcy (od podstawy wymiaru) */
    rates: {
        emerytalna: number;
        rentowa: number;
        chorobowa: number;
        wypadkowa: number;
        funduszPracy: number;
    };
    /** Podstawy wymiaru składek społecznych */
    bases: {
        /** Duży ZUS: 60% prognozowanego przeciętnego wynagrodzenia */
        duzy: number;
        /** Preferencyjny (24 mies.): 30% minimalnego wynagrodzenia */
        preferencyjny: number;
    };
    health: {
        /** Skala: 9% dochodu (nieodliczalna od podatku) */
        skalaRate: number;
        /** Liniowy: 4,9% dochodu (odliczalna od dochodu do rocznego limitu) */
        liniowyRate: number;
        /** Minimalna miesięczna składka zdrowotna (9% minimalnego wynagrodzenia) */
        minimum: number;
        /** Liniowy: roczny limit odliczenia zdrowotnej od dochodu */
        liniowyDeductionAnnualLimit: number;
        /** Ryczałt: stałe kwoty miesięczne wg progu PRZYCHODU rocznego */
        ryczaltTiers: Array<{ maxAnnualRevenue: number; monthlyAmount: number }>;
    };
    /** Stawki ryczałtu wybieralne w UI */
    ryczaltRates: number[];
}

export interface YearParams {
    year: number;
    /** Składki społeczne pracownika (część finansowana przez ubezpieczonego) */
    zusEmployee: { emerytalna: number; rentowa: number; chorobowa: number };
    /** Składka zdrowotna pracownika/zleceniobiorcy — od (brutto − społeczne) */
    healthRate: number;
    pit: {
        rate1: number;
        rate2: number;
        /** Próg roczny; w modelu miesięcznym stosujemy threshold/12 */
        annualThreshold: number;
        /** Miesięczna kwota zmniejszająca podatek (PIT-2): 3600/12 */
        monthlyTaxReducing: number;
    };
    /** Koszty uzyskania przychodu UoP (miesięczne) */
    kup: { standard: number; increased: number };
    /** Minimalne wynagrodzenie brutto/mies. */
    minWage: number;
    /** Ulga dla młodych — roczny limit przychodu */
    under26AnnualLimit: number;
    /** Roczny limit podstawy składek emerytalno-rentowych (30-krotność) — tylko do warningu */
    annualZusCapBase: number;
    ppk: {
        employeeMin: number;
        employeeMax: number;
        employeeDefault: number;
        employerMin: number;
        employerMax: number;
        employerDefault: number;
    };
    b2b: B2bParams;
}

export const PARAMS_BY_YEAR: Record<number, YearParams> = {
    2026: {
        year: 2026,
        zusEmployee: { emerytalna: 0.0976, rentowa: 0.015, chorobowa: 0.0245 },
        healthRate: 0.09,
        pit: {
            rate1: 0.12,
            rate2: 0.32,
            annualThreshold: 120_000,
            monthlyTaxReducing: 300,
        },
        kup: { standard: 250, increased: 300 },
        // source: Dz.U. 2025 poz. 1242 (rozporządzenie RM z 11.09.2025), sprawdzono 2026-07-13
        minWage: 4806,
        under26AnnualLimit: 85_528,
        // 30 × prognozowane przeciętne 9420 zł — source: zus.pl, sprawdzono 2026-07-13
        annualZusCapBase: 282_600,
        ppk: {
            employeeMin: 0.005,
            employeeMax: 0.04,
            employeeDefault: 0.02,
            employerMin: 0.015,
            employerMax: 0.04,
            employerDefault: 0.015,
        },
        b2b: {
            rates: {
                emerytalna: 0.1952,
                rentowa: 0.08,
                chorobowa: 0.0245,
                wypadkowa: 0.0167,
                funduszPracy: 0.0245,
            },
            bases: {
                // 60% × 9420 zł (prognozowane przeciętne) — source: zus.pl
                // "Nowe wysokości składek na ubezpieczenia społeczne w 2026 r.", sprawdzono 2026-07-13
                duzy: 5652,
                // 30% × 4806 zł minimalnego
                preferencyjny: 1441.8,
            },
            health: {
                skalaRate: 0.09,
                liniowyRate: 0.049,
                // 9% × 4806 zł — sprawdzono 2026-07-13
                minimum: 432.54,
                // obwieszczenie MF z 12.12.2025 — sprawdzono 2026-07-13
                liniowyDeductionAnnualLimit: 14_100,
                // 9% × (60%/100%/180%) × 9228,64 zł (przeciętne sektora przedsiębiorstw
                // IV kw. 2025, GUS) — sprawdzono 2026-07-13
                ryczaltTiers: [
                    { maxAnnualRevenue: 60_000, monthlyAmount: 498.35 },
                    { maxAnnualRevenue: 300_000, monthlyAmount: 830.58 },
                    { maxAnnualRevenue: Infinity, monthlyAmount: 1495.04 },
                ],
            },
            ryczaltRates: [0.085, 0.12, 0.14, 0.15],
        },
    },
};

export const DEFAULT_YEAR = 2026;

const paramsFor = (year?: number): YearParams => PARAMS_BY_YEAR[year ?? DEFAULT_YEAR] ?? PARAMS_BY_YEAR[DEFAULT_YEAR];

// ─── Wspólny kształt wyniku ───

export type BreakdownRowKind = 'deduction' | 'info';

export interface BreakdownRow {
    key: string;
    label: string;
    /** Kwota w zł (dodatnia) */
    amount: number;
    /** 'deduction' pomniejsza „na rękę" (wchodzi do paska); 'info' tylko do tabeli */
    kind: BreakdownRowKind;
    /** Podstawa naliczenia (do tabeli „skąd ta kwota?") */
    base?: number;
    ratePct?: number;
}

export interface SalaryResult {
    /** Dla UoP/zlecenia: brutto; dla B2B: miesięczny przychód netto (bez VAT) */
    grossMonthly: number;
    /** „Na rękę" */
    netMonthly: number;
    rows: BreakdownRow[];
    warnings: string[];
    /** (gross − net) / gross × 100, zaokrąglone do 0,1 p.p. */
    effectiveBurdenPct: number;
}

const pct = (rate: number) => Math.round(rate * 10000) / 100;

const finalize = (gross: number, net: number, rows: BreakdownRow[], warnings: string[]): SalaryResult => ({
    grossMonthly: round2(gross),
    netMonthly: round2(net),
    rows,
    warnings,
    effectiveBurdenPct: gross > 0 ? Math.round(((gross - net) / gross) * 1000) / 10 : 0,
});

/** Miesięczna zaliczka PIT wg skali (12/32%, próg roczny/12, opcjonalnie kwota zmniejszająca). */
const monthlyPitAdvance = (taxBase: number, p: YearParams, applyTaxReducing: boolean): number => {
    const monthlyThreshold = p.pit.annualThreshold / 12;
    const tax =
        p.pit.rate1 * Math.min(taxBase, monthlyThreshold) +
        p.pit.rate2 * Math.max(0, taxBase - monthlyThreshold) -
        (applyTaxReducing ? p.pit.monthlyTaxReducing : 0);
    return Math.max(0, roundZl(tax));
};

// ─── Umowa o pracę ───

export interface UopOptions {
    grossMonthly: number;
    year?: number;
    /** Stawka wpłaty pracownika do PPK; null/undefined = PPK wyłączone */
    ppkEmployeeRate?: number | null;
    /** Stawka wpłaty pracodawcy do PPK (istotna gdy PPK włączone) */
    ppkEmployerRate?: number;
    /** Ulga dla młodych (do 26. roku życia) */
    under26?: boolean;
    /** Koszty uzyskania: standard 250 / increased 300 (praca poza miejscem zamieszkania) */
    kup?: 'standard' | 'increased';
    /** PIT-2 (kwota zmniejszająca 300 zł/mies.) — na UoP domyślnie TAK */
    applyTaxReducing?: boolean;
}

/** Umowa o pracę: brutto → netto (model miesięczny). */
export function uopGrossToNet(opts: UopOptions): SalaryResult {
    const p = paramsFor(opts.year);
    const gross = Math.max(0, opts.grossMonthly);
    if (gross === 0) return finalize(0, 0, [], []);

    const applyTaxReducing = opts.applyTaxReducing ?? true;
    const kup = p.kup[opts.kup ?? 'standard'];
    const ppkOn = opts.ppkEmployeeRate !== null && opts.ppkEmployeeRate !== undefined;
    const ppkEmployeeRate = ppkOn ? opts.ppkEmployeeRate! : 0;
    const ppkEmployerRate = ppkOn ? (opts.ppkEmployerRate ?? p.ppk.employerDefault) : 0;

    const emerytalna = round2(gross * p.zusEmployee.emerytalna);
    const rentowa = round2(gross * p.zusEmployee.rentowa);
    const chorobowa = round2(gross * p.zusEmployee.chorobowa);
    const social = round2(emerytalna + rentowa + chorobowa);

    const healthBase = round2(gross - social);
    const zdrowotna = round2(healthBase * p.healthRate);

    const ppkEmployee = round2(gross * ppkEmployeeRate);
    const ppkEmployer = round2(gross * ppkEmployerRate);

    const warnings: string[] = [];
    let advance = 0;
    let taxBase = 0;

    if (opts.under26) {
        if (gross * 12 > p.under26AnnualLimit) {
            warnings.push(
                `Przy tych zarobkach przekroczysz roczny limit ulgi dla młodych (${p.under26AnnualLimit.toLocaleString('pl-PL')} zł) — nadwyżka jest opodatkowana, wynik jest przybliżeniem.`
            );
        }
    } else {
        taxBase = Math.max(0, roundZl(gross - social - kup + ppkEmployer));
        advance = monthlyPitAdvance(taxBase, p, applyTaxReducing);
    }

    if (gross * 12 > p.annualZusCapBase) {
        warnings.push(
            'Przy tych zarobkach w trakcie roku zadziała limit 30-krotności składek emerytalno-rentowych — realne netto w końcówce roku będzie wyższe.'
        );
    }
    if (taxBase > p.pit.annualThreshold / 12) {
        warnings.push(
            'Drugi próg podatkowy (32%) liczymy miesięcznie — realna zaliczka zależy od dochodów narastająco od początku roku.'
        );
    }

    const net = round2(gross - social - zdrowotna - advance - ppkEmployee);

    const rows: BreakdownRow[] = [
        { key: 'emerytalna', label: 'Składka emerytalna', amount: emerytalna, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.emerytalna) },
        { key: 'rentowa', label: 'Składka rentowa', amount: rentowa, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.rentowa) },
        { key: 'chorobowa', label: 'Składka chorobowa', amount: chorobowa, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.chorobowa) },
        { key: 'zdrowotna', label: 'Składka zdrowotna', amount: zdrowotna, kind: 'deduction', base: healthBase, ratePct: pct(p.healthRate) },
        { key: 'pit', label: opts.under26 ? 'Zaliczka PIT (ulga dla młodych)' : 'Zaliczka na PIT', amount: advance, kind: 'deduction', base: taxBase },
    ];
    if (ppkOn) {
        rows.push({ key: 'ppkEmployee', label: 'Wpłata do PPK (Twoja)', amount: ppkEmployee, kind: 'deduction', base: gross, ratePct: pct(ppkEmployeeRate) });
        rows.push({ key: 'ppkEmployer', label: 'Wpłata pracodawcy do PPK (trafia na Twoje konto PPK)', amount: ppkEmployer, kind: 'info', base: gross, ratePct: pct(ppkEmployerRate) });
    }

    return finalize(gross, net, rows, warnings);
}

/**
 * Umowa o pracę: netto → brutto (bisekcja po uopGrossToNet).
 * Funkcja netto(brutto) jest słabo rosnąca, więc bisekcja jest stabilna.
 */
export function uopNetToGross(targetNet: number, opts: Omit<UopOptions, 'grossMonthly'> = {}): SalaryResult {
    const target = Math.max(0, targetNet);
    if (target === 0) return finalize(0, 0, [], []);

    let lo = target;
    let hi = target * 2.2;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const net = uopGrossToNet({ ...opts, grossMonthly: mid }).netMonthly;
        if (Math.abs(net - target) < 0.01) {
            lo = mid;
            break;
        }
        if (net < target) lo = mid;
        else hi = mid;
    }
    return uopGrossToNet({ ...opts, grossMonthly: round2(lo) });
}

// ─── Umowa zlecenie ───

export interface ZlecenieOptions {
    grossMonthly: number;
    year?: number;
    /** Uczeń/student do 26 r.ż. — brak składek i PIT */
    studentUnder26?: boolean;
    /** Dobrowolna składka chorobowa */
    chorobowa?: boolean;
    /** PIT-2 na zleceniu możliwy, ale domyślnie NIE (inaczej niż UoP) */
    applyTaxReducing?: boolean;
}

/** Umowa zlecenie: brutto → netto (KUP 20%, jedyny tytuł do ubezpieczeń). */
export function zlecenieGrossToNet(opts: ZlecenieOptions): SalaryResult {
    const p = paramsFor(opts.year);
    const gross = Math.max(0, opts.grossMonthly);
    if (gross === 0) return finalize(0, 0, [], []);

    if (opts.studentUnder26) {
        return finalize(gross, gross, [
            { key: 'student', label: 'Uczeń/student do 26 r.ż. — brak składek ZUS i podatku', amount: 0, kind: 'info' },
        ], []);
    }

    const applyTaxReducing = opts.applyTaxReducing ?? false;

    const emerytalna = round2(gross * p.zusEmployee.emerytalna);
    const rentowa = round2(gross * p.zusEmployee.rentowa);
    const chorobowa = opts.chorobowa ? round2(gross * p.zusEmployee.chorobowa) : 0;
    const social = round2(emerytalna + rentowa + chorobowa);

    const healthBase = round2(gross - social);
    const zdrowotna = round2(healthBase * p.healthRate);

    const kup = round2(healthBase * 0.2);
    const taxBase = Math.max(0, roundZl(gross - social - kup));
    const advance = monthlyPitAdvance(taxBase, p, applyTaxReducing);

    const warnings: string[] = [
        'Zakładamy, że to Twój jedyny tytuł do ubezpieczeń (bez zbiegu z etatem lub innym zleceniem).',
    ];
    if (gross < 2000) {
        warnings.push(
            'Przy niskich kwotach składka zdrowotna bywa ustawowo ograniczana do wysokości hipotetycznej zaliczki — realne netto może być nieco wyższe.'
        );
    }

    const net = round2(gross - social - zdrowotna - advance);

    const rows: BreakdownRow[] = [
        { key: 'emerytalna', label: 'Składka emerytalna', amount: emerytalna, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.emerytalna) },
        { key: 'rentowa', label: 'Składka rentowa', amount: rentowa, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.rentowa) },
    ];
    if (opts.chorobowa) {
        rows.push({ key: 'chorobowa', label: 'Składka chorobowa (dobrowolna)', amount: chorobowa, kind: 'deduction', base: gross, ratePct: pct(p.zusEmployee.chorobowa) });
    }
    rows.push(
        { key: 'zdrowotna', label: 'Składka zdrowotna', amount: zdrowotna, kind: 'deduction', base: healthBase, ratePct: pct(p.healthRate) },
        { key: 'kup', label: 'Koszty uzyskania przychodu (20%)', amount: kup, kind: 'info', base: healthBase, ratePct: 20 },
        { key: 'pit', label: 'Zaliczka na PIT', amount: advance, kind: 'deduction', base: taxBase }
    );

    return finalize(gross, net, rows, warnings);
}

// ─── B2B (jednoosobowa działalność) ───

export type TaxForm = 'skala' | 'liniowy' | 'ryczalt';
export type ZusVariant = 'ulga_na_start' | 'preferencyjny' | 'duzy';

export interface B2bOptions {
    /** Miesięczny przychód netto (bez VAT) */
    monthlyRevenue: number;
    /** Miesięczne koszty działalności (bez składek ZUS) */
    monthlyCosts?: number;
    taxForm: TaxForm;
    /** Wymagana dla taxForm='ryczalt' */
    ryczaltRate?: number;
    zusVariant: ZusVariant;
    /** Dobrowolna chorobowa — domyślnie TAK (poza ulgą na start) */
    chorobowa?: boolean;
    year?: number;
}

interface B2bSocial {
    total: number;
    rows: BreakdownRow[];
}

const b2bSocialContributions = (p: YearParams, variant: ZusVariant, chorobowa: boolean): B2bSocial => {
    if (variant === 'ulga_na_start') {
        return {
            total: 0,
            rows: [{ key: 'zus', label: 'Składka ZUS (ulga na start — 6 mies. bez składek społecznych)', amount: 0, kind: 'info' }],
        };
    }
    const base = variant === 'duzy' ? p.b2b.bases.duzy : p.b2b.bases.preferencyjny;
    const r = p.b2b.rates;
    const emerytalna = round2(base * r.emerytalna);
    const rentowa = round2(base * r.rentowa);
    const chorobowaAmt = chorobowa ? round2(base * r.chorobowa) : 0;
    const wypadkowa = round2(base * r.wypadkowa);
    // Fundusz Pracy nie jest należny, gdy podstawa < minimalne wynagrodzenie (preferencyjny)
    const funduszPracy = variant === 'duzy' ? round2(base * r.funduszPracy) : 0;
    const total = round2(emerytalna + rentowa + chorobowaAmt + wypadkowa + funduszPracy);

    // Pojedynczy, zbiorczy wiersz ZUS — świadomie nie rozbijamy na składowe
    // (emerytalna/rentowa/chorobowa/wypadkowa/FP), bo to zaśmieca wynik B2B.
    return {
        total,
        rows: [{ key: 'zus', label: 'Składka ZUS (społeczne)', amount: total, kind: 'deduction', base, ratePct: base > 0 ? pct(total / base) : undefined }],
    };
};

/** B2B: miesięczne „na rękę" dla wybranej formy opodatkowania i wariantu ZUS. */
export function b2bMonthly(opts: B2bOptions): SalaryResult {
    const p = paramsFor(opts.year);
    const revenue = Math.max(0, opts.monthlyRevenue);
    const costs = Math.max(0, opts.monthlyCosts ?? 0);
    if (revenue === 0) return finalize(0, 0, [], []);

    const chorobowa = opts.chorobowa ?? opts.zusVariant !== 'ulga_na_start';
    const social = b2bSocialContributions(p, opts.zusVariant, chorobowa);
    const h = p.b2b.health;

    const income = revenue - costs - social.total; // dochód (może być ujemny)
    const warnings: string[] = ['Model miesięczny — bez rozliczenia rocznego, kwoty wolnej narastająco i danin dodatkowych (np. daniny solidarnościowej).'];
    if (opts.zusVariant === 'ulga_na_start') {
        warnings.push('Ulga na start obowiązuje 6 miesięcy — potem 24 miesiące ZUS preferencyjnego.');
    }

    let zdrowotna: number;
    let advance: number;
    let taxBase: number;

    const rows: BreakdownRow[] = [...social.rows];

    if (opts.taxForm === 'ryczalt') {
        const rate = opts.ryczaltRate ?? p.b2b.ryczaltRates[1];
        const annualRevenue = revenue * 12;
        const tier = h.ryczaltTiers.find((t) => annualRevenue <= t.maxAnnualRevenue) ?? h.ryczaltTiers[h.ryczaltTiers.length - 1];
        zdrowotna = tier.monthlyAmount;
        // Podstawa ryczałtu: przychód − społeczne − 50% zdrowotnej (koszty NIE pomniejszają)
        taxBase = Math.max(0, roundZl(revenue - social.total - 0.5 * zdrowotna));
        advance = Math.max(0, roundZl(rate * taxBase));
        warnings.push('Próg składki zdrowotnej wyznaczamy z przychodu miesięcznego × 12 — przy nieregularnych przychodach próg roczny może wypaść inaczej.');
        if (costs > 0) {
            rows.push({ key: 'kosztyInfo', label: 'Na ryczałcie koszty nie pomniejszają podstawy opodatkowania', amount: 0, kind: 'info' });
        }
        rows.push(
            { key: 'zdrowotna', label: 'Składka zdrowotna (ryczałt — stała kwota wg progu przychodu)', amount: zdrowotna, kind: 'deduction' },
            { key: 'pit', label: `Podatek dochodowy (ryczałt ${pct(rate)}%)`, amount: advance, kind: 'deduction', base: taxBase, ratePct: pct(rate) }
        );
    } else if (opts.taxForm === 'liniowy') {
        zdrowotna = Math.max(round2(h.liniowyRate * Math.max(0, income)), h.minimum);
        const monthlyDeductionLimit = h.liniowyDeductionAnnualLimit / 12;
        const healthDeduction = Math.min(zdrowotna, monthlyDeductionLimit);
        taxBase = Math.max(0, roundZl(income - healthDeduction));
        advance = Math.max(0, roundZl(0.19 * taxBase));
        rows.push(
            { key: 'zdrowotna', label: 'Składka zdrowotna (4,9% dochodu, min. ' + h.minimum.toLocaleString('pl-PL') + ' zł)', amount: zdrowotna, kind: 'deduction', base: Math.max(0, round2(income)), ratePct: pct(h.liniowyRate) },
            { key: 'pit', label: 'Podatek dochodowy (liniowy 19%)', amount: advance, kind: 'deduction', base: taxBase, ratePct: 19 }
        );
    } else {
        // skala
        zdrowotna = Math.max(round2(h.skalaRate * Math.max(0, income)), h.minimum);
        taxBase = Math.max(0, roundZl(income)); // zdrowotna nieodliczalna
        advance = monthlyPitAdvance(taxBase, p, true);
        if (taxBase > p.pit.annualThreshold / 12) {
            warnings.push('Drugi próg podatkowy (32%) liczymy miesięcznie — realna zaliczka zależy od dochodów narastająco.');
        }
        rows.push(
            { key: 'zdrowotna', label: 'Składka zdrowotna (9% dochodu, min. ' + h.minimum.toLocaleString('pl-PL') + ' zł)', amount: zdrowotna, kind: 'deduction', base: Math.max(0, round2(income)), ratePct: pct(h.skalaRate) },
            { key: 'pit', label: 'Podatek dochodowy (skala 12/32%)', amount: advance, kind: 'deduction', base: taxBase }
        );
    }

    if (costs > 0) {
        rows.unshift({ key: 'koszty', label: 'Koszty działalności', amount: costs, kind: 'deduction', base: revenue });
    }

    const net = round2(revenue - costs - social.total - zdrowotna - advance);
    return finalize(revenue, net, rows, warnings);
}

/** Porównanie 3 form opodatkowania obok siebie (te same przychody/koszty/ZUS). */
export function b2bCompareForms(
    opts: Omit<B2bOptions, 'taxForm' | 'ryczaltRate'>,
    ryczaltRate: number
): Record<TaxForm, SalaryResult> {
    return {
        skala: b2bMonthly({ ...opts, taxForm: 'skala' }),
        liniowy: b2bMonthly({ ...opts, taxForm: 'liniowy' }),
        ryczalt: b2bMonthly({ ...opts, taxForm: 'ryczalt', ryczaltRate }),
    };
}
