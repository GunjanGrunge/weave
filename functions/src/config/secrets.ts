import { defineSecret } from "firebase-functions/params";

export const GOOGLE_API_KEY = defineSecret("GOOGLE_API_KEY");
export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
