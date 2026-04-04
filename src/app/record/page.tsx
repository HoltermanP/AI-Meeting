"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import NewMeetingDialog from "@/components/meeting/NewMeetingDialog";
import { Button } from "@/components/ui/button";
import { Mic, Loader2 } from "lucide-react";

function RecordPageContent() {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultProjectId = searchParams.get("projectId");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
        <Mic className="h-10 w-10 text-indigo-600" />
      </div>
      <h2 className="text-xl font-semibold text-gray-800">Nieuwe opname starten</h2>
      <p className="text-sm text-gray-500">Maak een meeting aan en start direct met opnemen</p>
      <Button onClick={() => setOpen(true)} size="lg" className="gap-2">
        <Mic className="h-5 w-5" />
        Nieuwe meeting
      </Button>
      <NewMeetingDialog
        open={open}
        defaultProjectId={defaultProjectId}
        onClose={() => {
          setOpen(false);
          router.push("/meetings");
        }}
      />
    </div>
  );
}

export default function RecordPage() {
  return (
    <MainLayout title="Nieuwe opname">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        }
      >
        <RecordPageContent />
      </Suspense>
    </MainLayout>
  );
}
