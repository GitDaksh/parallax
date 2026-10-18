import type { Metadata } from "next";
import Lab from "@/components/lab/Lab";

export const metadata: Metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  return <Lab />;
}