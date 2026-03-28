"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import NewMeetingDialog from "@/components/meeting/NewMeetingDialog";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

export default function RecordPage() {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  return (
    <MainLayout title="New Recording">
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
          <Mic className="h-10 w-10 text-indigo-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800">Start a New Recording</h2>
        <p className="text-sm text-gray-500">Create a meeting and start recording right away</p>
        <Button onClick={() => setOpen(true)} size="lg" className="gap-2">
          <Mic className="h-5 w-5" />
          New Meeting
        </Button>
        <NewMeetingDialog open={open} onClose={() => { setOpen(false); router.push("/meetings"); }} />
      </div>
    </MainLayout>
  );
}
