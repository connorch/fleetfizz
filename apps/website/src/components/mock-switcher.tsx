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
  { value: "/", label: "Home (D)" },
  { value: "/mock/e", label: "E · band" },
  { value: "/mock/f", label: "F · fade" },
  { value: "/mock/g", label: "G · sheet" },
  { value: "/mock/h", label: "H · band + ledger" },
  { value: "/mock/i", label: "I · poster, Geist Mono" },
  { value: "/mock/j", label: "J · terminal, JetBrains Mono" },
  { value: "/mock/k", label: "K · statement, Space Mono" },
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
