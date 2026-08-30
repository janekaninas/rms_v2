import { PageHeader } from "@/components/page-header";
import { UploadForm } from "./upload-form";

export default function DailyUploadPage() {
  return (
    <div>
      <PageHeader eyebrow="Data" title="Daily Upload" />
      <UploadForm />
    </div>
  );
}
