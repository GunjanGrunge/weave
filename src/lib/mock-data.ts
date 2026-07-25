export const currentBook = {
  id: "glass-cartographer",
  title: "The Glass Cartographer",
  subtitle: "Book One of the Meridian Cycle",
  genre: "Literary Fantasy",
  status: "Drafting" as const,
  wordCount: 42802,
  wordGoal: 80000,
  progress: 0.535,
  streak: 12,
  wordsToday: 1402,
  dailyGoal: 1500,
  lastEdited: "2 minutes ago",
  cover: "GC",
};

export const books = [
  currentBook,
  { id: "hollow-crown", title: "The Hollow Crown", subtitle: "A political thriller", genre: "Thriller", status: "Revision" as const, wordCount: 78400, wordGoal: 90000, progress: 0.87, streak: 0, wordsToday: 0, dailyGoal: 1000, lastEdited: "3 days ago", cover: "HC" },
  { id: "salt-and-star", title: "Salt & Star", subtitle: "Coastal memoir", genre: "Memoir", status: "Outline" as const, wordCount: 4200, wordGoal: 60000, progress: 0.07, streak: 0, wordsToday: 0, dailyGoal: 800, lastEdited: "3 weeks ago", cover: "SS" },
];

export type ChapterStatus = "Outline" | "Drafting" | "Revision" | "Done";

export const chapters: Array<{
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  wordCount: number;
  target: number;
  pov: string;
  summary: string;
}> = [
  { id: "ch1", number: 1, title: "The Compass Wakes", status: "Done", wordCount: 3820, target: 3500, pov: "Elias", summary: "Elias inherits his grandfather's brass compass and feels its first thrum." },
  { id: "ch2", number: 2, title: "Ink Still Wet", status: "Done", wordCount: 3410, target: 3500, pov: "Elias", summary: "A cartographer's guild meeting reveals maps rewriting themselves overnight." },
  { id: "ch3", number: 3, title: "The Fractured Telescope", status: "Done", wordCount: 4020, target: 3500, pov: "Elias", summary: "Elias buys a broken instrument that shows stars where none should be." },
  { id: "ch4", number: 4, title: "A Bell That Refused", status: "Done", wordCount: 3705, target: 3500, pov: "Isolde", summary: "Isolde, the harbor watcher, records a single toll and then only silence." },
  { id: "ch5", number: 5, title: "The Meridian Shifts", status: "Revision", wordCount: 3980, target: 3500, pov: "Elias", summary: "Instruments across the capital lose their agreement about north." },
  { id: "ch6", number: 6, title: "The Gargoyle's Testimony", status: "Revision", wordCount: 3240, target: 3500, pov: "Isolde", summary: "Stone gargoyles begin turning to face a horizon no one can see." },
  { id: "ch7", number: 7, title: "Cedar and Iron", status: "Drafting", wordCount: 2810, target: 3500, pov: "Elias", summary: "The fog carries scents from cities that no longer exist." },
  { id: "ch8", number: 8, title: "The Waiting Room of Maps", status: "Drafting", wordCount: 2450, target: 3500, pov: "Vale", summary: "Vale, the guild's archivist, opens a room where drafts breathe." },
  { id: "ch9", number: 9, title: "Correspondence With a Stranger", status: "Drafting", wordCount: 1980, target: 3500, pov: "Elias", summary: "Letters arrive from a version of Elias who chose differently." },
  { id: "ch10", number: 10, title: "What the Harbor Knows", status: "Outline", wordCount: 0, target: 3500, pov: "Isolde", summary: "Isolde finally speaks with the thing beneath the water." },
  { id: "ch11", number: 11, title: "The Cartographers' Court", status: "Outline", wordCount: 0, target: 3500, pov: "Vale", summary: "A tribunal to decide whose map is real." },
  { id: "ch12", number: 12, title: "The Silent Meridian", status: "Drafting", wordCount: 2280, target: 3500, pov: "Elias", summary: "Elias walks the shifting city alone at dawn." },
  { id: "ch13", number: 13, title: "Glass in the Pocket", status: "Outline", wordCount: 0, target: 3500, pov: "Elias", summary: "The compass reveals what it truly is." },
  { id: "ch14", number: 14, title: "The Rewritten Horizon", status: "Outline", wordCount: 0, target: 3500, pov: "Elias", summary: "The final approach to the meridian's edge." },
];

export const characters = [
  { id: "elias", name: "Elias Thorne", role: "Protagonist", arc: "Reluctant cartographer → guardian of the meridian", traits: ["observant", "guarded", "loyal"], color: "oklch(0.55 0.13 40)", initials: "ET" },
  { id: "isolde", name: "Isolde Marren", role: "Deuteragonist", arc: "Silent watcher → prophetic voice", traits: ["patient", "clairvoyant", "grief-worn"], color: "oklch(0.5 0.11 200)", initials: "IM" },
  { id: "vale", name: "Vale Osric", role: "Mentor", arc: "Archivist → conspirator", traits: ["meticulous", "haunted", "brilliant"], color: "oklch(0.55 0.1 130)", initials: "VO" },
  { id: "cassia", name: "Cassia Wren", role: "Antagonist", arc: "Guildmaster → false meridian", traits: ["poised", "ruthless", "eloquent"], color: "oklch(0.55 0.15 20)", initials: "CW" },
  { id: "hark", name: "Hark", role: "Companion", arc: "Street runner → cartographer's apprentice", traits: ["quick", "irreverent", "curious"], color: "oklch(0.6 0.12 90)", initials: "H" },
  { id: "meren", name: "Meren the Bellwright", role: "Supporting", arc: "Craftsman → oracle", traits: ["old", "kind", "cryptic"], color: "oklch(0.5 0.05 60)", initials: "MB" },
  { id: "asa", name: "Asa Vane", role: "Ally", arc: "Naval captain → smuggler of maps", traits: ["restless", "principled", "witty"], color: "oklch(0.55 0.11 260)", initials: "AV" },
  { id: "mother", name: "The Mother Meridian", role: "Mythic", arc: "Legend → living presence", traits: ["ancient", "impartial", "vast"], color: "oklch(0.45 0.06 320)", initials: "MM" },
];

export const relationships: Array<{ from: string; to: string; label: string }> = [
  { from: "elias", to: "isolde", label: "confides in" },
  { from: "elias", to: "vale", label: "apprenticed to" },
  { from: "vale", to: "cassia", label: "reports to" },
  { from: "cassia", to: "elias", label: "hunts" },
  { from: "hark", to: "elias", label: "follows" },
  { from: "elias", to: "meren", label: "consults" },
  { from: "asa", to: "isolde", label: "estranged from" },
  { from: "mother", to: "elias", label: "watches over" },
];

export const locations = [
  { id: "aethelgard", name: "Aethelgard", kind: "Capital city", note: "Limestone teeth biting a leaden sky." },
  { id: "harbor", name: "The Bell Harbor", kind: "Waterfront", note: "Where the fog first learned to speak." },
  { id: "guild", name: "The Cartographers' Guild", kind: "Institution", note: "Marble halls of shifting maps." },
  { id: "archive", name: "The Waiting Room of Maps", kind: "Hidden library", note: "Drafts that breathe when unattended." },
  { id: "meridian", name: "The Silent Meridian", kind: "Mythic locus", note: "The line that unmakes lines." },
  { id: "ridge", name: "Obsidian Ridge", kind: "Wilderness", note: "Black glass under a sky that forgets weather." },
];

export const organizations = [
  { id: "guild", name: "The Cartographers' Guild", motto: "By line and lantern", members: 214 },
  { id: "wardens", name: "The Harbor Wardens", motto: "First to hear, last to speak", members: 42 },
  { id: "court", name: "The Court of Instruments", motto: "The needle serves the true", members: 12 },
  { id: "wren", name: "House Wren", motto: "The map we make is the world we keep", members: 88 },
];

export const loreEntries = [
  { id: "meridian-law", title: "The Meridian Law", body: "Every map contains the memory of the map that came before it. To rewrite a boundary is to persuade a memory." },
  { id: "glass-rose", title: "The Glass Rose", body: "A cartographer's instrument said to refract a north only its bearer can see. Rumored to be made from the tears of the Mother Meridian." },
  { id: "the-toll", title: "The Toll", body: "When the world is being redrawn, the bells of Aethelgard ring once and then refuse. The silence is instruction." },
];

export const timelineEvents = [
  { id: "e1", year: "Year of the Long Fog · Autumn", chapter: 1, title: "Elias inherits the compass" },
  { id: "e2", year: "Year of the Long Fog · Autumn", chapter: 3, title: "The fractured telescope is purchased" },
  { id: "e3", year: "Year of the Long Fog · Winter", chapter: 4, title: "The single bell tolls in the harbor" },
  { id: "e4", year: "Year of the Long Fog · Winter", chapter: 6, title: "The gargoyles turn their heads" },
  { id: "e5", year: "Year of the Silent Meridian · Spring", chapter: 8, title: "Vale opens the Waiting Room" },
  { id: "e6", year: "Year of the Silent Meridian · Spring", chapter: 12, title: "Elias walks the shifting city" },
  { id: "e7", year: "Year of the Silent Meridian · Summer", chapter: 14, title: "Approach to the meridian's edge" },
];

export const consistencyIssues = [
  { id: "i1", kind: "Character" as const, severity: "high" as const, chapter: 5, title: "Elias's eye color changes", detail: "Grey in Ch. 2, described as 'seawater green' in Ch. 5." },
  { id: "i2", kind: "Character" as const, severity: "med" as const, chapter: 9, title: "Isolde's accent drift", detail: "Speaks in short cadence early; long, lilting sentences by Ch. 9." },
  { id: "i3", kind: "Timeline" as const, severity: "high" as const, chapter: 7, title: "Season overlaps solstice", detail: "Ch. 6 places events in winter; Ch. 7 mentions autumn festival two days later." },
  { id: "i4", kind: "Timeline" as const, severity: "low" as const, chapter: 12, title: "Bell tolls out of order", detail: "The single toll is referenced twice as 'first'." },
  { id: "i5", kind: "Plot" as const, severity: "high" as const, chapter: 9, title: "Compass abilities inconsistent", detail: "Chapter 3 says it only vibrates near ley lines; Chapter 9 shows it directing Elias in a windowless room." },
  { id: "i6", kind: "Plot" as const, severity: "med" as const, chapter: 11, title: "Vale's motive gap", detail: "No scene establishes why Vale betrays the Guild before the tribunal." },
];

export const refactorImpact = {
  from: "The Brass Compass",
  to: "The Glass Rose",
  chaptersAffected: 14,
  conflictRisks: 2,
  estimatedRewrite: 1204,
  affectedChapters: [
    { chapter: 1, note: "Inheritance scene rewritten for glasswork.", status: "auto" as const },
    { chapter: 2, note: "Magnetism reference replaced with optical translucence.", status: "auto" as const },
    { chapter: 3, note: "Instrument dialogue adjusted to reference petals.", status: "auto" as const },
    { chapter: 5, note: "Needle metaphor removed from Elias's monologue.", status: "auto" as const },
    { chapter: 6, note: "Compass-in-pocket weight cues rewritten.", status: "review" as const },
    { chapter: 9, note: "Locked-room scene needs rewriting for glass logic.", status: "review" as const },
    { chapter: 12, note: "Central diff (below) — 'brass compass' → 'glass rose'.", status: "active" as const },
    { chapter: 13, note: "Reveal scene fully rewritten (largest delta).", status: "review" as const },
  ],
  diff: {
    chapter: 12,
    page: 204,
    before:
      "He reached into his heavy coat and pulled out the brass compass. The needle spun wildly, unable to find North in a city that had lost its center.",
    after:
      "He reached into his heavy coat and pulled out the fractured glass rose. Its petals glowed with a faint, internal light, refracting a North that no one else could see.",
    highlights: ["fractured glass rose", "petals glowed"],
  },
  versions: [
    { id: "v1", label: "Original manuscript", date: "Mar 3", note: "Brass compass, magnetic logic." },
    { id: "v2", label: "Glass rose — proposal", date: "Today · 09:24", note: "AI-generated refactor, 14 chapters." },
    { id: "v3", label: "Glass rose — revised", date: "Today · 10:12", note: "You accepted 6 of 8 chapters." },
  ],
};

export const publishingChecklist = [
  { id: "p1", label: "Manuscript formatting", done: true, note: "6x9 trim, chapter breaks confirmed." },
  { id: "p2", label: "Cover art approved", done: true, note: "Final v3 delivered by Marren Studio." },
  { id: "p3", label: "Front & back matter", done: true, note: "Dedication, acknowledgments, epigraph." },
  { id: "p4", label: "Copy edit pass", done: false, note: "In progress — Sasha, due Friday." },
  { id: "p5", label: "ISBN assigned", done: false, note: "Awaiting Bowker confirmation." },
  { id: "p6", label: "KDP metadata & keywords", done: false, note: "Draft ready for review." },
  { id: "p7", label: "IngramSpark upload", done: false, note: "Pending copy edit." },
  { id: "p8", label: "Launch page live", done: false, note: "Landing page in review." },
];

export const aiActions = [
  "Rewrite",
  "Improve",
  "Expand",
  "Shorten",
  "Change Style",
  "Continue Writing",
  "Find Plot Holes",
  "Generate Ideas",
  "Explain Feedback",
] as const;

export const researchThreads = [
  { id: "r1", q: "18th-century harbor bell mechanisms", a: "Bronze bells in Baltic harbors used a leather-lined yoke; the yoke was often reused after a bell cracked, giving the replacement bell a different overtone but the same 'voice'.", sources: 4 },
  { id: "r2", q: "How would fog behave in a valley with two rivers?", a: "Valley fog forms first at the confluence and drifts uphill as the ground cools. It thins along ridge lines and pools in leeward hollows.", sources: 3 },
  { id: "r3", q: "Historical names for cartographers' guilds", a: "The Compagnia dei Cartografi (Venice, 1476), the Konstlyckor (Stockholm, 1602), and the Guild of the Compass Rose (Bruges, 1517) are useful period references.", sources: 6 },
];

export const notifications = [
  { id: "n1", label: "AI finished a Story Refactor draft", time: "2m" },
  { id: "n2", label: "Sasha left 3 comments in Chapter 5", time: "1h" },
  { id: "n3", label: "Daily writing goal reached", time: "3h" },
];
