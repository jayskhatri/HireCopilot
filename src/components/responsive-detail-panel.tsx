import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { type ReactNode, useSyncExternalStore } from "react";

const BELOW_XL_QUERY = "(max-width: 1279px)";

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(BELOW_XL_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(BELOW_XL_QUERY).matches;
}

export function ResponsiveDetailPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const isBelowXl = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (!isBelowXl) return children;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl [&>button]:hidden">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
