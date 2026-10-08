import { CopilotPanel } from "@/components/copilot-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Home,
  Menu,
  Search,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/open-positions", label: "Open Positions", icon: BriefcaseBusiness },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/orchestrator", label: "Interview Orchestrator", icon: CalendarClock },
  { to: "/pipeline", label: "Pipeline", icon: Workflow },
  { to: "/copilot", label: "Copilot (Teams)", icon: Bot },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/configuration", label: "Configuration", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const openCopilotFromMobileNav = () => {
    setMobileNavOpen(false);
    setCopilotOpen(true);
  };

  const navigation = (mobile = false) => (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              onClick={mobile ? () => setMobileNavOpen(false) : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={mobile ? openCopilotFromMobileNav : () => setCopilotOpen(true)}
        className="m-3 rounded-xl bg-teams px-4 py-3 text-left text-teams-foreground transition-opacity hover:opacity-90"
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4" /> Ask Copilot
        </p>
        <p className="mt-0.5 text-xs opacity-80">Hire smarter with AI</p>
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold leading-none">HireCopilot</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Interview Orchestrator by AI</p>
          </div>
        </div>
        {navigation()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-[min(20rem,85vw)] flex-col bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex items-center gap-2 px-5 py-5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <p className="font-display text-lg font-semibold leading-none">HireCopilot</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Interview Orchestrator by AI
                    </p>
                  </div>
                </div>
                {navigation(true)}
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-semibold">{title}</h1>
              {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground md:flex">
              <Search className="size-4" />
              <span>Search candidates, roles…</span>
            </div>
            {actions && <div className="order-last w-full sm:order-none sm:w-auto">{actions}</div>}
            <Button variant="outline" size="icon" aria-label="Notifications">
              <Bell className="size-4" />
            </Button>
            <Button
              className="gap-2 bg-teams px-3 text-teams-foreground hover:bg-teams/90 sm:px-4"
              onClick={() => setCopilotOpen(true)}
            >
              <Bot className="size-4" /> <span className="hidden sm:inline">Copilot</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-5 sm:py-6">{children}</main>
      </div>

      <CopilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />
      <Toaster position="top-right" richColors />
    </div>
  );
}
