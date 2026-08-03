import prisma from '../lib/prisma';
import { logger } from './logger';

export const seedCategories = async () => {
    const categories = [
        { name: 'Sklepy spożywcze', color: '#FF6B6B', icon: 'shopping-cart', description: 'Biedronka, Lidl, Kaufland, Auchan, Carrefour, Tesco, Żabka, Lewiatan, Dino, Netto, Stokrotka, Aldi, Społem, Dealz, Pozostałe sklepy spożywcze' },
        { name: 'Stacje Paliw', color: '#3742fa', icon: 'fuel', description: 'Orlen, BP, Shell, Lotos, Circle K, Amic, Inna stacja paliw' },
        { name: 'Restauracje', color: '#FFA502', icon: 'utensils', description: 'McDonalds, KFC, Burger King, Pizza Hut, Starbucks, Costa Coffee, Grycan, Manekin, Pyszne.pl, Uber Eats, Wolt, Glovo, Restauracja' },
        { name: 'Markety budowlane', color: '#e056fd', icon: 'hammer', description: 'Castorama, Leroy Merlin, OBI, Bricoman, Mrówka, Market budowlany' },
        { name: 'Elektronika', color: '#00d2d3', icon: 'monitor', description: 'RTV Euro AGD, Media Expert, Media Markt, X-Kom, Komputronik, Morele, Samsung, Apple, iSpot, Sklep elektroniczny' },
        { name: 'Ubrania i buty', color: '#be2edd', icon: 'shirt', description: 'Zara, H&M, Reserved, eobuwie, Zalando, Modivo, TK Maxx, Pepco, CCC, Deichmann, Sinsay, Mohito, Cropp, House, Inny sklep odzieżowy' },
        { name: 'Apteki', color: '#22a6b3', icon: 'pill', description: 'DOZ, Gemini, Cefarm, SuperPharm, Super-Pharm, Apteka' },
        { name: 'Transport', color: '#1e90ff', icon: 'bus', description: 'Uber, Bolt, Free Now, FreeNow, Taxi, MPK, ZTM, Jakdojade, PKP, Intercity, SKM, Bilety, Autostrada, Hulajnoga, Samochód, Inny rodzaj transportu' },
        { name: 'Rozrywka', color: '#f6e58d', icon: 'film', description: 'Kino, Teatr, Opera, Koncert, Teatr muzyczny, Netflix, Spotify, Steam, PlayStation, Xbox, Nintendo, Ticketmaster, eBilet, Player, HBO, Disney, Amazon, CDA, Empik, Storytel, Rozrywka' },
        { name: 'Usługi beauty', color: '#badc58', icon: 'scissors', description: 'Fryzjer, Barber, Kosmetyczka, Paznokcie, Manicure, Pedicure, Usługi beauty' },
        { name: 'Służba zdrowia', color: '#eb4d4b', icon: 'activity', description: 'Dermatolog, Dentysta, Stomatolog, Ortodonta, Okulista, LuxMed, Medicover, Badania, Kardiolog, Fizjoterapeuta, Przychodnia, Szpital, Laboratorium, Diagnostyka, Lekarz' },
        { name: 'Drogerie', color: '#ff7979', icon: 'sparkles', description: 'Rossmann, Hebe, Douglas, Sephora, Natura, Chemia, Drogeria' },
        { name: 'Podróże', color: '#f9ca24', icon: 'plane', description: 'Booking, Airbnb, LOT, Ryanair, Wizzair, Hotel, Nocleg, Wycieczka, Wakacje.pl, Flixbus, PKP Intercity, Blablacar, eSky, TUI, Rainbow, Itaka' },
        { name: 'Zakupy internetowe', color: '#0984e3', icon: 'shopping-bag', description: 'Allegro, Amazon, eBay, AliExpress, Temu, Shein, InPost, Paczkomat, Sklep online' },
        { name: 'Abonamenty', color: '#686de0', icon: 'credit-card', description: 'Orange, T-Mobile, Play, Plus, UPC, Vectra, Multimedia, Canal+, Cyfrowy Polsat, Telefon, Abonament, Heyah, Nju, Inea, Netia' },
        { name: 'Zajęcia Sportowe', color: '#6ab04c', icon: 'dumbbell', description: 'Multisport, Siłownia, Joga, Fitness, Basen, Decathlon, Martes, Intersport, Zdrofit, CityFit, Sport' },
        { name: 'Opłaty', color: '#4FD1C5', icon: 'file-text', description: 'PGE, Gaz, Prąd, Śmieci, Czynsz, Podatki, Energa, PGNiG, Wodociągi, Mieszkanie, Składka w pracy, Internet, Urząd Skarbowy, Inne opłaty' },
        { name: 'Dom', color: '#96CEB4', icon: 'home', description: 'IKEA, Jysk, Duka, Home&You, Action, Tedi, Agata Meble, Black Red White, Meble' },
        { name: 'Jedzenie i napoje', color: '#F39C12', icon: 'coffee', description: 'Alkohol, Winoteka, Bar, Pub, Miasto' },
        { name: 'Edukacja', color: '#a29bfe', icon: 'book', description: 'Księgarnia, Empik, Kurs, Szkoła, Uczelnia, Studia, Udemy, Coursera, Angielski, Edukacja' },
        { name: 'Działalność gospodarcza', color: '#636e72', icon: 'briefcase', description: 'ZUS, PPE, VAT, PIT, Księgowy, Biuro Rachunkowe, Inny koszt' },
        { name: 'Ubezpieczenia', color: '#b2bec3', icon: 'shield', description: 'OC, AC, Ubezpieczenie na Życie, Ubezpieczenie Zdrowotne, Ubezpieczenie Turystyczne, NNW, Generali, Inne ubezpieczenie' },
        { name: 'Przelew wewnętrzny', color: '#7f8c8d', icon: 'repeat', description: 'Przelew wewnętrzny' },
        { name: 'Inne', color: '#dfe6e9', icon: 'tag', description: 'Inne' },
        { name: 'Wpływ', color: '#2ecc71', icon: 'briefcase', description: 'Wypłata, Premia, Zwrot, Odsetki, Dywidenda, Ankieta, Sprzedaż, Obligacje, Inny przychód' },
        { name: 'Dzieci', color: '#FF9FF3', icon: 'baby', description: 'Smyk, 5.10.15, Coccodrillo, H&M Kids, Reserved Kids, Zara Kids, Księgarnia, Empik, Przedszkole, Rada Rodziców, Obiady szkolne, Korepetycje, Szkoła Językowa, Zajęcia Sportowe, Zajęcia Taneczne, Zajęcia muzyczne, Niania, Opiekunka, Sala Zabaw, Fryzjer Dziecięcy, Składka Klasowa, Kieszonkowe, Inne' },
        { name: 'Zwierzęta domowe', color: '#A3CB38', icon: 'paw-print', description: 'Zooplus, Maxi Zoo, Kakadu, Dolina Noteci, Sklep zoologiczny, Weterynarz, Badania, Szczepienia, Groomer, Behawiorysta, Hotel dla zwierząt, Petsitter, Ubezpieczenie, Podatek, Paszport, Inne' }
    ];

    // --- Merge Logic: "Zdrowie" -> "Zdrowie i Uroda" REMOVED ---
    // (Legacy migration logic removed as per user request)
    // ----------------------------------------------------
    // ----------------------------------------------------

    for (const cat of categories) {
        let category = await prisma.category.findFirst({ where: { name: cat.name, userId: null } });

        if (!category) {
            category = await prisma.category.create({ data: cat });
            logger.info(`Created category: ${cat.name}`);
        } else {
            // Update details if changed
            if (category.description !== cat.description || category.color !== cat.color || category.icon !== cat.icon) {
                category = await prisma.category.update({
                    where: { id: category.id },
                    data: {
                        description: cat.description,
                        color: cat.color,
                        icon: cat.icon
                    }
                });
                logger.info(`Updated details for: ${cat.name}`);
            }
        }

        // --- Migrate keywords to Store table (System Stores) ---
        if (cat.description && category) {
            const stores = cat.description.split(',').map(s => s.trim()).filter(s => s.length > 0);

            for (const storeName of stores) {
                // Check if system store exists
                const existingStore = await prisma.store.findFirst({
                    where: {
                        name: storeName,
                        userId: null
                    }
                });

                if (!existingStore) {
                    await prisma.store.create({
                        data: {
                            name: storeName,
                            categoryId: category.id,
                            userId: null // System store
                        }
                    });
                    logger.info(`  -> Created system store: ${storeName}`);
                } else {
                    // Update category link if needed (e.g. if we move a store to another category)
                    if (existingStore.categoryId !== category.id) {
                        await prisma.store.update({
                            where: { id: existingStore.id },
                            data: { categoryId: category.id }
                        });
                        logger.info(`  -> Updated category for store: ${storeName}`);
                    }
                }
            }
        }
    }
};
