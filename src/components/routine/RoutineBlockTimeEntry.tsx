"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { createPortal } from "react-dom";
import { format } from "date-fns";

export interface RoutineBlockTimeEntryProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: TimeEntryData) => Promise<void>;
  initialData?: TimeEntryData | null;
  scheduledStart?: string;
  scheduledEnd?: string;
  blockTitle?: string;
  isLoading?: boolean;
  error?: string | null;
  blockId?: string;
  date?: string;
}

export interface TimeEntryData {
  actualStartTime?: string;
  actualEndTime?: string;
  status: "COMPLETED" | "PARTIAL" | "MISSED" | "IN_PROGRESS";
  focusRating?: number;
  productivityRating?: number;
  energyLevel?: number;
  note?: string;
  onTimeStart: boolean;
  onTimeEnd: boolean;
}

export function RoutineBlockTimeEntry({
  open,
  onClose,
  onSave,
  initialData = null,
  scheduledStart,
  scheduledEnd,
  blockTitle = "Routine Block",
  error = null,
}: RoutineBlockTimeEntryProps) {
  const [formData, setFormData] = useState<TimeEntryData>({
    actualStartTime: initialData?.actualStartTime || "",
    actualEndTime: initialData?.actualEndTime || "",
    status: (initialData?.status as TimeEntryData["status"]) || "COMPLETED",
    focusRating: initialData?.focusRating || 3,
    productivityRating: initialData?.productivityRating || 3,
    energyLevel: initialData?.energyLevel || 3,
    note: initialData?.note || "",
    onTimeStart: initialData?.onTimeStart ?? (initialData?.actualStartTime === scheduledStart),
    onTimeEnd: initialData?.onTimeEnd ?? (initialData?.actualEndTime === scheduledEnd),
  });
  const [saveError, setSaveError] = useState<string | null>(error);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const nowTime = format(now, "HH:mm");

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save time entry");
    } finally {
      setSaving(false);
    }
  };

  const isValidTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const isValid = () => {
    if (formData.status === "IN_PROGRESS") {
      return isValidTime(formData.actualStartTime || "");
    }
    return isValidTime(formData.actualStartTime || "") && isValidTime(formData.actualEndTime || "");
  };

  const formatTimeDisplay = (time: string | undefined) => {
    if (!time) return "—";
    const parts = time.split(":");
    const hour = parseInt(parts[0] || "0", 10);
    const minute = parts[1] || "00";
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute} ${ampm}`;
  };

  if (!open) return null;

  const ratingsContent = formData.status === "MISSED" ? null : (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Focus</label>
          <select
            value={formData.focusRating}
            onChange={(e) => setFormData(prev => ({ ...prev, focusRating: parseInt(e.target.value) }))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{"★".repeat(n) + "☆".repeat(5 - n)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Productivity</label>
          <select
            value={formData.productivityRating}
            onChange={(e) => setFormData(prev => ({ ...prev, productivityRating: parseInt(e.target.value) }))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{"★".repeat(n) + "☆".repeat(5 - n)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Energy</label>
          <select
            value={formData.energyLevel}
            onChange={(e) => setFormData(prev => ({ ...prev, energyLevel: parseInt(e.target.value) }))}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{"★".repeat(n) + "☆".repeat(5 - n)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-foreground">
          Notes (optional)
        </label>
        <Input
          id="note"
          type="text"
          value={formData.note || ""}
          onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
          placeholder="Any notes about this session..."
        />
      </div>

      <div className="space-y-3">
        <Switch
          checked={formData.onTimeStart}
          onChange={(checked) => setFormData(prev => ({ ...prev, onTimeStart: checked }))}
          label="Started on time"
          description="Whether you started at the scheduled time"
          disabled={!formData.actualStartTime}
        />
        <Switch
          checked={formData.onTimeEnd}
          onChange={(checked) => setFormData(prev => ({ ...prev, onTimeEnd: checked }))}
          label="Ended on time"
          description="Whether you finished at the scheduled time"
          disabled={!formData.actualEndTime || formData.status === "IN_PROGRESS"}
        />
      </div>
    </div>
  );

  const dialogContent = (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} size="lg">
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Time Entry: {blockTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-1">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Scheduled Start</span>
              <span className="font-mono font-medium">{formatTimeDisplay(scheduledStart ?? "")}</span>
            </div>
            <div className="flex justify-between">
              <span>Scheduled End</span>
              <span className="font-mono font-medium">{formatTimeDisplay(scheduledEnd ?? "")}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-foreground">Status</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {(["COMPLETED", "PARTIAL", "MISSED", "IN_PROGRESS"] as const).map((status) => (
                  <Button
                    key={status}
                    variant={formData.status === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, status }))}
                    className={formData.status === status ? "bg-primary text-primary-foreground" : ""}
                  >
                    {status === "IN_PROGRESS" && "🔄"}
                    {status === "COMPLETED" && "✓"}
                    {status === "PARTIAL" && "◐"}
                    {status === "MISSED" && "✗"}
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="actual-start" className="mb-1.5 block text-sm font-medium text-foreground">
                Actual Start Time
                {scheduledStart && (
                  <span className="ml-1 text-xs text-muted-foreground">(Scheduled: {formatTimeDisplay(scheduledStart ?? "")})</span>
                )}
              </label>
              <Input
                  id="actual-start"
                  type="time"
                  value={formData.actualStartTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, actualStartTime: e.target.value }))}
                  required={formData.status !== "MISSED"}
                  disabled={formData.status === "MISSED"}
                  max={formData.status === "IN_PROGRESS" ? nowTime : undefined}
                />
                {scheduledStart && formData.actualStartTime && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formData.onTimeStart ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ On time</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">⚠ {(() => {
                        const startParts = formData.actualStartTime.split(":");
                        const scheduledParts = (scheduledStart ?? "").split(":");
                        const actualMinutes = (parseInt(startParts[0] ?? "0", 10) * 60) + parseInt(startParts[1] ?? "0", 10);
                        const scheduledMinutes = (parseInt(scheduledParts[0] ?? "0", 10) * 60) + parseInt(scheduledParts[1] ?? "0", 10);
                        return Math.abs(actualMinutes - scheduledMinutes);
                      })()} min late</span>
                    )}
                  </p>
                )}
              </div>

            {formData.status !== "IN_PROGRESS" && (
              <div>
                <label htmlFor="actual-end" className="mb-1.5 block text-sm font-medium text-foreground">
                  Actual End Time
                  {scheduledEnd && (
                    <span className="ml-1 text-xs text-muted-foreground">(Scheduled: {formatTimeDisplay(scheduledEnd ?? "")})</span>
                  )}
                </label>
                <Input
                  id="actual-end"
                  type="time"
                  value={formData.actualEndTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, actualEndTime: e.target.value }))}
                  required
                  min={formData.actualStartTime}
                />
                {scheduledEnd && formData.actualEndTime && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formData.onTimeEnd ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ On time</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">⚠ {(() => {
                        const endParts = formData.actualEndTime.split(":");
                        const scheduledParts = (scheduledEnd ?? "").split(":");
                        const actualMinutes = (parseInt(endParts[0] ?? "0", 10) * 60) + parseInt(endParts[1] ?? "0", 10);
                        const scheduledMinutes = (parseInt(scheduledParts[0] ?? "0", 10) * 60) + parseInt(scheduledParts[1] ?? "0", 10);
                        return Math.abs(actualMinutes - scheduledMinutes);
                      })()} min late</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {ratingsContent}

            {saveError && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={handleSave} isLoading={saving} disabled={!isValid() || saving}>
                <Check className="mr-2 h-4 w-4" />
                {initialData ? "Update" : "Save"} Time Entry
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (typeof document !== "undefined") {
    return createPortal(dialogContent, document.body);
  }
  return null;
}

export default RoutineBlockTimeEntry;