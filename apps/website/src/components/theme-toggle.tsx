import { Button } from "@fleetfizz/ui/components/button";
import { SunMoonIcon } from "@fleetfizz/ui/components/sun-moon-icon";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";

// Runs in <head> before paint: applies the stored theme, else the system one,
// so the page never flashes the wrong theme.
export const themeInitScript = `(()=>{const t=localStorage.getItem("theme");const d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)})()`;

export function ThemeToggle() {
  const { ref, triggerProps } = useIconHover();
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={toggle}
      {...triggerProps}
    >
      <SunMoonIcon ref={ref} size={16} />
    </Button>
  );
}
