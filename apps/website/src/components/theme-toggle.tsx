import { Button } from "@fleetfizz/ui/components/button";
import { MoonIcon, SunIcon } from "lucide-react";

// Runs in <head> before paint: applies the stored theme, else the system one,
// so the page never flashes the wrong theme.
export const themeInitScript = `(()=>{const t=localStorage.getItem("theme");const d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)})()`;

export function ThemeToggle() {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggle}>
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  );
}
