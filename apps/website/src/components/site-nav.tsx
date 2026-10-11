import { Button } from "@fleetfizz/ui/components/button";
import { Link } from "@tanstack/react-router";
import { version } from "fleetfizz/package.json";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

export const GITHUB_URL = "https://github.com/connorch/fleetfizz";

export function SiteNav() {
  return (
    <header>
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" render={<Link to="/" />} nativeButton={false}>
            Docs
          </Button>
          <Button variant="ghost" size="sm" render={<a href={GITHUB_URL} />} nativeButton={false}>
            GitHub
          </Button>
          <span className="text-muted-foreground px-2 font-mono text-xs">v{version}</span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
