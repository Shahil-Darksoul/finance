"use client";

import * as React from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useMounted } from "@/lib/hooks/useMounted";
import { formatMoney } from "@/lib/utils/money";

const STORAGE_KEY = "ledgerly:celebrated-goals:v1";

export type AchievedGoal = {
  id: string;
  name: string;
  targetCents: number;
};

/*
 * Celebrated-goal ids live in localStorage. Same-tab writes do not fire the
 * `storage` event, so writes go through a tiny listener set that the
 * `useSyncExternalStore` subscription also listens on.
 */
const storeListeners = new Set<() => void>();

function readSeenIds(): ReadonlySet<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Iterable<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing with storage disabled — worst case is a repeat popup.
  }
  storeListeners.forEach((listener) => listener());
}

function subscribeToSeenIds(onStoreChange: () => void): () => void {
  storeListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    storeListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * Congratulations popup for fully funded savings goals.
 *
 * The server passes every goal that has hit its target; this component pops
 * up (with confetti) for any not yet celebrated on this device, recording
 * them in localStorage when dismissed so the popup does not reappear on every
 * visit. Rendered on both the goals page and the dashboard, so whichever the
 * user opens first does the celebrating.
 */
export function GoalCelebration({
  goals,
  currency,
}: {
  goals: AchievedGoal[];
  currency: string;
}) {
  const { confetti } = useToast();
  const mounted = useMounted();

  const seenJson = React.useSyncExternalStore(
    subscribeToSeenIds,
    () => {
      try {
        return localStorage.getItem(STORAGE_KEY) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const seenIds = React.useMemo(() => {
    try {
      const parsed = JSON.parse(seenJson);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set<string>();
    }
  }, [seenJson]);

  const fresh = mounted
    ? goals.filter((goal) => !seenIds.has(goal.id))
    : [];
  const freshKey = fresh.map((goal) => goal.id).join(",");

  // A dismissed popup stays down for this set of goals; if a new goal is
  // achieved during the same session, its key differs and it gets its popup.
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  const open = fresh.length > 0 && dismissedKey !== freshKey;

  const confettiFired = React.useRef(false);
  React.useEffect(() => {
    if (!open || confettiFired.current) return;
    confettiFired.current = true;
    confetti();
  }, [open, confetti]);

  if (fresh.length === 0) return null;

  const single = fresh.length === 1;

  function acknowledge() {
    persistSeenIds([...readSeenIds(), ...fresh.map((goal) => goal.id)]);
    setDismissedKey(freshKey);
  }

  return (
    <Modal
      open={open}
      onClose={acknowledge}
      title={single ? "Goal reached!" : "Goals reached!"}
      description={
        single
          ? `You fully funded "${fresh[0].name}".`
          : `You fully funded ${fresh.length} savings goals.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={acknowledge}>
            Close
          </Button>
          <Button asChild>
            <Link href="/goals" onClick={acknowledge}>
              View goals
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
          <PartyPopper className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-2 text-sm">
          {fresh.map((item) => (
            <p key={item.id} className="leading-relaxed">
              <span className="font-medium">{item.name}</span> —{" "}
              {formatMoney(item.targetCents, { currency })} saved.
            </p>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Every dollar was tracked here in Ledgerly. Time to pick your next
            target.
          </p>
        </div>
      </div>
    </Modal>
  );
}
