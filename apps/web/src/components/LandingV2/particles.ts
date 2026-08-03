/**
 * Deterministyczne rozrzucenie cząsteczek tła na landingu.
 *
 * Dlaczego nie `Math.random()`: landing jest PRERENDEROWANY w Node
 * (scripts/prerender.mjs), a klient ten markup HYDRATUJE. Losowanie w trakcie
 * renderu daje inne wartości na serwerze i w przeglądarce, więc React przy
 * hydracji widzi niezgodny `style` i musi go nadpisać — czyli cząsteczki
 * potrafią przeskoczyć w pierwszej klatce. Ziarno oparte na indeksie daje ten
 * sam układ po obu stronach, a wygląda dokładnie tak samo losowo.
 *
 * `Math.sin` jako źródło szumu wystarcza: nie potrzebujemy tu kryptografii
 * ani równomiernego rozkładu, tylko powtarzalnego rozrzutu.
 */
function noise(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

export interface Particle {
    id: number;
    left: string;
    top: string;
    size: string;
    dur: string;
    delay: string;
}

/**
 * @param count    ile cząsteczek
 * @param spread   margines od krawędzi w % (pozycje trafiają w `spread`…`100 - spread`)
 * @param maxDur   górna granica czasu trwania animacji w sekundach (dolna to 5 s)
 * @param maxDelay górna granica opóźnienia startu w sekundach
 * @param offset   przesunięcie ziarna — różne dla różnych bloków, żeby dwa
 *                 sąsiadujące zestawy cząsteczek nie miały identycznego układu
 */
export function makeParticles(
    count: number,
    spread: number,
    maxDur: number,
    maxDelay: number,
    offset = 0,
): Particle[] {
    return Array.from({ length: count }, (_, i) => {
        const s = offset + i * 4;
        return {
            id: i,
            left: `${spread + noise(s + 1) * (100 - 2 * spread)}%`,
            top: `${spread + noise(s + 2) * (100 - 2 * spread)}%`,
            size: `${2 + noise(s + 3) * 3}px`,
            dur: `${5 + noise(s + 4) * (maxDur - 5)}s`,
            delay: `${noise(s + 5) * maxDelay}s`,
        };
    });
}
