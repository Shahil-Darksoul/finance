import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChartPie,
  LineChart,
  Lock,
  Receipt,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { BrandMark } from "@/components/app/brand-mark";
import { ThemeToggle } from "@/components/app/theme-toggle";

const FEATURES = [
  {
    icon: Wallet,
    title: "Every account, one balance",
    body: "Cash, savings, credit cards, loans and brokerage accounts in a single net-worth figure that updates as you log transactions.",
  },
  {
    icon: ChartPie,
    title: "Where the money actually went",
    body: "Category breakdowns and month-over-month trends computed from your own records, with the underlying figures one click away.",
  },
  {
    icon: CalendarDays,
    title: "Bills and safe-to-spend",
    body: "Ledgerly tracks what is due before your next payday and estimates what should remain. Recurring rules and EMI schedules included.",
  },
  {
    icon: Target,
    title: "Goals with real progress",
    body: "Set a target and a date, and see how much of each month's surplus is actually being directed towards it.",
  },
  {
    icon: LineChart,
    title: "Forecasts from your history",
    body: "Projections built on your own averages, with every assumption stated up front and labelled as a forecast rather than a promise.",
  },
  {
    icon: Receipt,
    title: "Import and export",
    body: "Bring in a CSV export from your bank, or take everything back out again. Your data is yours.",
  },
];

export function WelcomePage() {
  return (
    <div className="min-h-dvh">
      {/* --------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[80rem] items-center gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">Ledgerly</span>
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* --------------------------------------------------------- hero */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3 text-accent" aria-hidden />
              Start with a fictional demo dataset
            </p>

            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.08]">
              Know exactly where your money goes,
              <span className="text-primary"> and what is left</span> before the month
              ends.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Ledgerly brings accounts, bills, savings goals and investments into
              one dashboard. Every forecast is built from your own history and
              shown with the assumptions that produced it.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  Create your account
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto"
              >
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  I already have one
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground/70">
              No card required. Demo data is fictional and clearly labelled.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ features */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto w-full max-w-[80rem]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="h-full">
                    <CardBody>
                      <span
                        className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"
                        aria-hidden
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <h2 className="text-sm font-semibold tracking-tight">
                        {feature.title}
                      </h2>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {feature.body}
                      </p>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- honesty */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto w-full max-w-[80rem]">
            <Card>
              <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-muted"
                  aria-hidden
                >
                  <Lock className="h-4 w-4" />
                </span>
                <div className="space-y-1.5">
                  <h2 className="text-sm font-semibold tracking-tight">
                    A tracker, not an advisor
                  </h2>
                  <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    Ledgerly reports on the numbers you recorded. Health scores,
                    projections and forecasts are calculations built from your own
                    records, and they are labelled as estimates wherever they appear.
                    Nothing in the app is personalised financial advice.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-[80rem] flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-2">
            <BrandMark className="h-5 w-5" />
            Ledgerly
          </span>
          <span>Built for people who want the numbers to add up.</span>
        </div>
      </footer>
    </div>
  );
}