import { auth } from "@clerk/nextjs/server";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  await auth.protect();
  return <DashboardClient />;
}
