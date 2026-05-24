"use client";

import { useRouter } from "next/navigation";
import { ModelLoader } from "@/components/ModelLoader";

export default function SetupPage() {
  const router = useRouter();

  return <ModelLoader onReady={() => router.push("/")} />;
}
