import { Button } from "@fleetfizz/ui/components/button";
import { MoonIcon } from "@fleetfizz/ui/components/moon-icon";
import { SunIcon } from "@fleetfizz/ui/components/sun-icon";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";
import { useEffect, useState } from "react";

// Runs in <head> before paint: applies the stored theme, else dark, so the
// page never flashes the wrong theme. The server renders dark too.
export const themeInitScript = `(()=>{const t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t!=="light")})()`;

// Shows the theme a click would switch to: the sun in the dark, the moon in
// the light. The server renders the dark state; a stored light theme is read
// after mount.
export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const { ref, triggerProps } = useIconHover();
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
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
