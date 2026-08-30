"use client";

import { Button } from "@/components/ui/button";
import { deleteSetting } from "./actions";

export function DeleteSettingButton({ settingKey }: { settingKey: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (confirm(`Remove setting "${settingKey}"?`)) {
          deleteSetting(settingKey);
        }
      }}
    >
      Remove
    </Button>
  );
}
