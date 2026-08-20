import { redirect } from "next/navigation";

// The admin and authority monitor dashboards were merged into a single
// shared /monitor page. This stub keeps old bookmarks/links working.
export default function LegacyMonitorRedirect() {
  redirect("/monitor");
}
