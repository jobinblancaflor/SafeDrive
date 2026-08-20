import { redirect } from "next/navigation";

export default function LegacyMonitorIncidentRedirect({
  params,
}: {
  params: { incident_id: string };
}) {
  redirect(`/monitor/${params.incident_id}`);
}
