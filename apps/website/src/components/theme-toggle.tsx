import { Button } from "@fleetfizz/ui/components/button";
import { MoonIcon } from "@fleetfizz/ui/components/moon-icon";
import { SunIcon } from "@fleetfizz/ui/components/sun-icon";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";
import { useSyncExternalStore } from "react";

// Runs in <head> before paint: applies the stored theme, else dark, so the
// page never flashes the wrong theme. The server renders dark too.
export const themeInitScript = `(()=>{const t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t!=="light")})()`;

// The theme is the `dark` class on <html>. Every toggle on the page reads it
// from there, so they agree however many are mounted.
const isDark = () => document.documentElement.classList.contains("dark");
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const useDark = () => useSyncExternalStore(subscribe, isDark, () => true);

// Shows the theme a click would switch to: the sun in the dark, the moon in
// the light.
export function ThemeToggle() {
  const dark = useDark();
  const { ref, triggerProps } = useIconHover();
  const toggle = () => {
    document.documentElement.classList.toggle("dark", !dark);
    localStorage.setItem("theme", dark ? "light" : "dark");
  };
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? "Light theme" : "Dark theme"}
      onClick={toggle}
      {...triggerProps}
    >
      {dark ? <SunIcon ref={ref} size={16} /> : <MoonIcon ref={ref} size={16} />}
    </Button>
  );
}
