import { useRef } from 'react';
import UopInputs, { useUopCalculator } from './UopInputs';
import ZlecenieInputs, { useZlecenieCalculator } from './ZlecenieInputs';
import B2bInputs, { useB2bCalculator } from './B2bInputs';
import ResultPanel from './ResultPanel';

export type SalaryMode = 'uop' | 'zlecenie' | 'b2b';

const NET_LABEL: Record<SalaryMode, string> = {
    uop: 'Na rękę co miesiąc',
    zlecenie: 'Na rękę co miesiąc',
    b2b: 'Zostaje Ci co miesiąc',
};

/**
 * Publiczny kalkulator wynagrodzeń — trzy tryby (UoP / zlecenie / B2B),
 * wyniki live, bez logowania. Osadzany w ciemnym panelu na stronach SEO.
 */
export default function SalaryCalculator({ mode }: { mode: SalaryMode }) {
    const usedRef = useRef(false);
    const markUsed = () => {
        if (!usedRef.current) {
            usedRef.current = true;
        }
    };

    // Hooki wywoływane bezwarunkowo (rules of hooks) — koszt to czysta arytmetyka.
    const uop = useUopCalculator();
    const zlecenie = useZlecenieCalculator();
    const b2b = useB2bCalculator();

    const result = mode === 'uop' ? uop.result : mode === 'zlecenie' ? zlecenie.result : b2b.result;

    return (
        <div className="space-y-6" onClickCapture={markUsed} onInputCapture={markUsed}>
            {mode === 'uop' && <UopInputs state={uop} />}
            {mode === 'zlecenie' && <ZlecenieInputs state={zlecenie} />}
            {mode === 'b2b' && <B2bInputs state={b2b} />}

            <div className="border-t border-white/10 pt-5">
                <ResultPanel
                    result={result}
                    netLabel={NET_LABEL[mode]}
                    compare={mode === 'b2b' ? b2b.compare : undefined}
                    activeForm={mode === 'b2b' ? b2b.taxForm : undefined}
                    onSelectForm={mode === 'b2b' ? b2b.setTaxForm : undefined}
                    extraStats={mode === 'b2b' ? b2b.extraStats : undefined}
                />
            </div>
        </div>
    );
}
