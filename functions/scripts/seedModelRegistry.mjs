import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// One-time admin script (Story 1.4, AD-9): writes the pinned AI model
// registry into config/geminiModels. Not called by app code - run manually
// once per Firebase project (e.g. `node scripts/seedModelRegistry.mjs`) with
// credentials that can write to that project's Firestore.
const registry = {
  generate: {
    primary: { provider: "openai", model: "gpt-5.6-terra" },
    fallback: { provider: "gemini", model: "gemini-2.5-pro" },
  },
  openingSuggestion: {
    primary: { provider: "openai", model: "gpt-5.6-terra" },
    fallback: { provider: "gemini", model: "gemini-2.5-pro" },
  },
  museNote: {
    primary: { provider: "openai", model: "gpt-5.6-luna" },
    fallback: { provider: "gemini", model: "gemini-3.6-flash" },
  },
  chapterSummary: {
    primary: { provider: "openai", model: "gpt-5.6-luna" },
    fallback: { provider: "gemini", model: "gemini-3.6-flash" },
  },
  entityExtraction: {
    primary: { provider: "openai", model: "gpt-5.4-nano" },
    fallback: { provider: "gemini", model: "gemini-3.5-flash-lite" },
  },
  embedding: { provider: "gemini", model: "gemini-embedding-2", outputDimensionality: 768 },
};

initializeApp();
await getFirestore().collection("config").doc("geminiModels").set(registry);
console.log("Seeded config/geminiModels:", JSON.stringify(registry, null, 2));
