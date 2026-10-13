/**
 * Zufaellige "Besetzung" fuer Beitragsbilder mit Menschen. Bildmodelle liefern bei allgemeinen Personenangaben immer dasselbe
 * Durchschnittsgesicht; konkrete, wechselnde Merkmale im Prompt verhindern das.
 */
const AGES = ["Mitte 20", "Ende 20", "Anfang 30", "Mitte 30", "Ende 30", "Anfang 40", "Mitte 40", "Ende 40", "Anfang 50", "Mitte 50", "Ende 50", "Anfang 60"];
const GENDERS = ["Frau", "Mann"];
const LOOKS = [
  "mitteleuropäisches Erscheinungsbild",
  "südeuropäisches Erscheinungsbild",
  "nordeuropäisches Erscheinungsbild",
  "osteuropäisches Erscheinungsbild",
  "türkisches oder nahöstliches Erscheinungsbild",
  "südasiatisches Erscheinungsbild",
  "ostasiatisches Erscheinungsbild",
  "schwarzes afrikanisches oder afrodeutsches Erscheinungsbild",
  "lateinamerikanisches Erscheinungsbild",
];
const HAIR_F = ["langes glattes dunkelbraunes Haar", "schulterlanges gewelltes blondes Haar", "kurzer grauer Bob", "lockiges schwarzes Haar", "zum Dutt gebundenes rotbraunes Haar", "kurzes silbergraues Haar", "langer geflochtener Zopf", "kinnlanger dunkler Bob mit Pony", "kurzes lockiges Haar", "Kopftuch"];
const HAIR_M = ["kurzes dunkles Haar", "Glatze", "grau meliertes kurzes Haar", "lockiges braunes Haar", "welliges blondes Haar", "rotblonder Vollbart", "graue Schläfen und kurzer Bart", "schwarzes zurückgekämmtes Haar", "Dreitagebart und kurzes Haar", "längeres Haar im Nacken zusammengebunden"];
const EXTRAS = ["mit Brille", "ohne Brille", "mit Brille", "ohne Brille", "mit Sommersprossen", "mit Lachfalten", "mit markantem Kinn", "mit rundem Gesicht", "mit schmalem Gesicht"];
const BUILDS = ["schlank", "kräftig", "athletisch", "untersetzt", "groß und schlaksig", "zierlich", "breitschultrig"];
const OUTFITS = [
  "hellblaues Hemd, Jeans",
  "dunkelgrüner Pullover",
  "grauer Blazer über weißem Shirt",
  "senffarbener Strickpullover",
  "kariertes Hemd mit hochgekrempelten Ärmeln",
  "marineblaues Sakko, kein Schlips",
  "Arbeitsjacke mit Reflexstreifen",
  "bordeauxfarbene Bluse",
  "Kapuzenpullover unter einer Weste",
  "beiger Mantel",
  "weißer Kittel",
  "schwarzer Rollkragenpullover",
];

const pick = <T>(list: readonly T[], rand: () => number): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))]!;

/** Beschreibt `count` frei erfundene Personen mit wechselnden Merkmalen, je Zeile eine Person. */
export function castPeople(count = 3, rand: () => number = Math.random): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const gender = pick(GENDERS, rand);
    const hair = pick(gender === "Frau" ? HAIR_F : HAIR_M, rand);
    lines.push(`Person ${i + 1}: ${gender}, ${pick(AGES, rand)}, ${pick(LOOKS, rand)}, ${pick(BUILDS, rand)}, ${hair}, ${pick(EXTRAS, rand)}, ${pick(OUTFITS, rand)}`);
  }
  return lines;
}
