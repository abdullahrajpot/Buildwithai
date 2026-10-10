"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRole } from "./providers";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field, Select } from "./ui/misc";
import { api, type CasesResponse } from "@/lib/client";

const schema = z.object({
  patient_id: z.string().min(1, "Pick a patient"),
  procedure_code: z.string().min(1, "Pick a procedure"),
  insurer: z.string().min(1, "Pick an insurer"),
});
type Form = z.infer<typeof schema>;

export function NewCaseDialog({ open, onOpenChange, options }: { open: boolean; onOpenChange: (o: boolean) => void; options: CasesResponse["options"] }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { actor } = useRole();
  const defaults: Form = { patient_id: "PT-B", procedure_code: "73721", insurer: "INS-A" };
  const { register, handleSubmit, watch, setValue, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });
  const patientId = watch("patient_id");
  const v = watch();

  // Default the procedure to the one ordered for the chosen patient.
  useEffect(() => {
    const p = options.patients.find((x) => x.id === patientId);
    if (p) setValue("procedure_code", p.procedure_code);
  }, [patientId, options.patients, setValue]);

  const onSubmit = async (form: Form) => {
    try {
      const res = await api<{ id: string }>("/api/cases", { method: "POST", json: { ...form, run: true, actor } });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      onOpenChange(false);
      router.push(`/cases/${res.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const patient = options.patients.find((p) => p.id === v.patient_id);
  const proc = options.procedures.find((p) => p.code === v.procedure_code);
  const ins = options.insurers.find((i) => i._id === v.insurer);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New pre-authorization case" description="The copilot reads the chart, retrieves the insurer's criteria, and checks every one for evidence.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Field label="Patient">
          <Select {...register("patient_id")}>
            {options.patients.map((p) => (
              <option key={p.id} value={p.id}>{p.label}: {p.name_masked}, {p.age} {p.sex}</option>
            ))}
          </Select>
        </Field>
        <Field label="Procedure">
          <Select {...register("procedure_code")}>
            {options.procedures.map((p) => <option key={p.code} value={p.code}>{p.name} (CPT {p.code})</option>)}
          </Select>
        </Field>
        <Field label="Insurer">
          <Select {...register("insurer")}>
            {options.insurers.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.subtitle})</option>)}
          </Select>
        </Field>
        <div className="rounded-[10px] border border-line bg-paper px-4 py-3 text-[13px]">
          <div className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Summary</div>
          <div className="mt-1 font-medium">{proc?.name ?? "-"} for {patient ? `${patient.label} (${patient.name_masked})` : "-"}, checked against {ins?.name ?? "-"}</div>
          <div className="mt-1 text-ink-3">Runs on {options.provider.label}. A human approves every submission.</div>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={formState.isSubmitting} icon={<Sparkles className="size-4" strokeWidth={1.75} />}>Run Copilot</Button>
        </div>
      </form>
    </Dialog>
  );
}
