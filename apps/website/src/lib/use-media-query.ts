import { useEffect, useState } from "react";

// Whether the page matches a media query, following it live. False until
// mounted, so the server render always assumes it does not match.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = matchMedia(query);
    setMatches(list.matches);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Whether the visitor asks for reduced motion. The server render assumes motion.
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
