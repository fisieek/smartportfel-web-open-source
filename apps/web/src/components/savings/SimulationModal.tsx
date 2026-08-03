import Modal from '../ui/Modal';
import RealGainsWidget from './RealGainsWidget';

interface Props {
    /** Id konta do symulacji lub null (modal zamknięty). */
    accountId: string | null;
    /** Data końca promocji konta (dla widgetu). */
    promoEndsAt?: string;
    onClose: () => void;
}

/** Modal symulacji realnych zysków dla wybranego konta/lokaty. */
export default function SimulationModal({ accountId, promoEndsAt, onClose }: Props) {
    return (
        <Modal
            isOpen={!!accountId}
            onClose={onClose}
            title="Realne Zyski - Symulacja"
        >
            {accountId && (
                <RealGainsWidget
                    accountId={accountId}
                    promoEndsAt={promoEndsAt}
                />
            )}
            <div className="flex justify-end mt-6">
                <button
                    onClick={onClose}
                    className="py-3 px-8 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm"
                >
                    Zamknij
                </button>
            </div>
        </Modal>
    );
}
