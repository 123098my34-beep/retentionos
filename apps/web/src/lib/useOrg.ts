"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useSession } from "./useSession";

// For the scaffold we resolve the user's first organization membership.
// A real multi-workspace UI would let the user switch orgs.
export function useOrg() {
  const { user, token } = useSession();
  const membership = useQuery(
    api.orgs.myMembership,
    token && user ? { sessionToken: token } : "skip",
  );
  return {
    user,
    token,
    orgId: membership?.orgId ?? null,
    ready: user === undefined ? false : true,
  };
}
