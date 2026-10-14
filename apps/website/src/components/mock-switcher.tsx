import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@fleetfizz/ui/components/select";
import { useLocation, useNavigate } from "@tanstack/react-router";

// Every landing mock, and the homepage. Goes away once one is chosen.
const MOCKS = [
  { value: "/", label: "Home" },
  { value: "/mock/p", label: "P · in line, below the fold" },
  { value: "/mock/q", label: "Q · versions grid, below the fold" },
  { value: "/mock/r", label: "R · in line, above the fold" },
  { value: "/mock/s", label: "S · devices on a wire" },
  { value: "/mock/t", label: "T · tailnet map" },
  { value: "/mock/u", label: "U · rail across the page" },
] as const;

export function MockSwitcher() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const current = MOCKS.find((m) => m.value === pathname);
  return (
    <Select
      items={MOCKS}
      value={current?.value ?? null}
      onValueChange={(value) => {
        const mock = MOCKS.find((m) => m.value === value);
        if (mock) void navigate({ to: mock.value });
      }}
    >
      <SelectTrigger size="sm" aria-label="Mock">
        <SelectValue placeholder="Mock" />
      </SelectTrigger>
      <SelectContent>
        {MOCKS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
