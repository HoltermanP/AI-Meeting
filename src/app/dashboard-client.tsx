"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import NewMeetingDialog from "@/components/meeting/NewMeetingDialog";

export default function DashboardClient() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
        <Plus className="h-4 w-4" />
        New Meeting
      </Button>
      <NewMeetingDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
