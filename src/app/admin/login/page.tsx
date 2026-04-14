"use client";

import { useRouter } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  const router = useRouter();
  return <AdminLogin onLoginSuccess={() => router.push("/admin/queue-qr-generator")} />;
}
