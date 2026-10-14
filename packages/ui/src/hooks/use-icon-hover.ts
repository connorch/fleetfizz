import { useRef } from "react";

// The handle every animateicons icon exposes through its ref.
export interface IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// Plays an icon's animation while its parent is hovered or focused, so a
// button animates its icon: attach `ref` to the icon, spread `triggerProps`
// on the button.
export function useIconHover() {
  const ref = useRef<IconHandle>(null);
  const start = () => ref.current?.startAnimation();
  const stop = () => ref.current?.stopAnimation();
  return {
    ref,
    triggerProps: { onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop },
  };
}
