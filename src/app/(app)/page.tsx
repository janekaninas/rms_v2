import { redirect } from "next/navigation";

// The Overview/Dashboard page is Day 7 scope (PRODUCT_SPEC.md §5) — nothing
// to show there yet, so "/" lands on the one functional area built so far
// rather than a placeholder page built ahead of its data.
export default function RootPage() {
  redirect("/configuration/villas");
}
