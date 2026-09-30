/**
 * Film Substrates Master Settings & LocalStorage Store
 * Isolated service to avoid circular dependencies between factoryStore, settingsService, and supabaseDataService.
 */

export const FILM_SUBSTRATES_STORAGE_KEY = 'samyak_film_substrates_master';

export const DEFAULT_FILM_SUBSTRATES = [
  { id: 'sub-1', name: "PET", density: 1.40, category: "Polyester", description: "Standard Biaxially-oriented PET film" },
  { id: 'sub-2', name: "METPET", density: 1.40, category: "Metallized Film", description: "Metallized Polyester film for high barrier" },
  { id: 'sub-3', name: "BOPP", density: 0.91, category: "Polypropylene", description: "Biaxially Oriented Polypropylene Film" },
  { id: 'sub-4', name: "Metalised BOPP", density: 0.91, category: "Metallized Film", description: "Metallized BOPP film for barrier packaging" },
  { id: 'sub-5', name: "Pearlised BOPP", density: 0.70, category: "Polypropylene", description: "Cavitated / Pearlised BOPP film for ice creams & confectionery" },
  { id: 'sub-6', name: "Matte BOPP", density: 0.91, category: "Polypropylene", description: "Matte finish BOPP film for premium tactile feel" },
  { id: 'sub-7', name: "CPP", density: 0.91, category: "Polypropylene", description: "Cast Polypropylene film for lamination & sealing" },
  { id: 'sub-8', name: "Metalised CPP", density: 0.91, category: "Metallized Film", description: "Metallized Cast Polypropylene film" },
  { id: 'sub-9', name: "MATTA", density: 0.94, category: "Polyethylene", description: "Milky Atta (High Dart) LD Film" },
  { id: 'sub-10', name: "NMET", density: 0.935, category: "Polyethylene", description: "Natural LD Metallocene Film" },
  { id: 'sub-11', name: "MMET", density: 0.935, category: "Polyethylene", description: "Milky LD Metallocene Film" },
  { id: 'sub-12', name: "MGP", density: 0.93, category: "Polyethylene", description: "Milky LD General Purpose Film" },
  { id: 'sub-13', name: "NGP", density: 0.93, category: "Polyethylene", description: "Natural LD General Purpose Film" },
  { id: 'sub-14', name: "LDPE", density: 0.93, category: "Polyethylene", description: "Low Density Polyethylene film" },
  { id: 'sub-15', name: "LLDPE", density: 0.94, category: "Polyethylene", description: "Linear Low Density Polyethylene film for heavy dart strength" },
  { id: 'sub-16', name: "PVC", density: 1.38, category: "Vinyl", description: "Polyvinyl Chloride shrink sleeve film" },
  { id: 'sub-17', name: "Aluminium Foil", density: 2.70, category: "Foil & Metal", description: "Pure Aluminium barrier foil" },
  { id: 'sub-18', name: "Paper", density: 0.80, category: "Cellulosic Paper", description: "Flexible packaging kraft / maplitho paper" }
];

export function getFilmSubstrates() {
  try {
    const saved = localStorage.getItem(FILM_SUBSTRATES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    return DEFAULT_FILM_SUBSTRATES;
  } catch (e) {
    return DEFAULT_FILM_SUBSTRATES;
  }
}
