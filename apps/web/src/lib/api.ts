"use client";

// Thin re-export of the generated Convex API so the rest of the app can import
// a single stable path. Generated code lives in apps/convex/_generated.
// @ts-ignore generated at runtime by `convex dev`
import { api } from "../../../convex/_generated/api";
export { api };
export type { FunctionReference } from "convex/server";
