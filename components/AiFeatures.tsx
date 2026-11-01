"use client";
import { createContext } from "react";
import { NO_AI, type AiFeatures } from "../lib/languages";

// Which AI features the signed-in account can use, from /api/workspace. Components hide
// what isn't available instead of offering it and failing.
export const AiFeaturesContext = createContext<AiFeatures>(NO_AI);
