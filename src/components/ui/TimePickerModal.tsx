"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Clock, Check, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { createPortal } from "react-dom";

export interface TimePickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (time: string) => void;
  /** Initial time in HH:mm format */
  initialTime?: string;
  /** Modal title */
  title?: string;
  /** Modal description */
  description?: string;
  /** Whether to show seconds */
  showSeconds?: boolean;
  /** 12h or 24h format */
  timeFormat?: "12h" | "24h";
  /** Disable past times (relative to now) */
  disablePast?: boolean;
  /** Disable future times */
  disableFuture?: boolean;
  /** Loading state for confirm button */
  isLoading?: boolean;
  /** Minimum time in HH:mm (when disablePast) */
  minTime?: string;
  /** Maximum time in HH:mm (when disableFuture) */
  maxTime?: string;
}

export function TimePickerModal({
  open,
  onClose,
  onConfirm,
  initialTime = "",
  title = "Select Time",
  description,
  showSeconds = false,
  timeFormat = "24h",
  disablePast = false,
  disableFuture = false,
  isLoading = false,
  minTime,
  maxTime,
}: TimePickerModalProps) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [error, setError] = useState<string | null>(null);

  // Parse initial time
  useEffect(() => {
    if (initialTime) {
      const parts = initialTime.split(":");
      if (parts.length >= 2) {
        let h = parseInt(parts[0] ?? "0", 10);
        const m = parseInt(parts[1] ?? "0", 10);
        const s = parts[2] ? parseInt(parts[2] ?? "0", 10) : 0;

        if (timeFormat === "12h") {
          if (h === 0) {
            h = 12;
            setPeriod("AM");
          } else if (h === 12) {
            setPeriod("PM");
          } else if (h > 12) {
            h -= 12;
            setPeriod("PM");
          } else {
            setPeriod("AM");
          }
        }
        setHours(h);
        setMinutes(m);
        if (showSeconds) setSeconds(s);
      }
    }
  }, [initialTime, timeFormat, showSeconds]);

  const formatTime = useCallback((): string => {
    let h = hours;
    if (timeFormat === "12h") {
      if (period === "PM" && h !== 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
    }
    const hStr = String(h).padStart(2, "0");
    const mStr = String(minutes).padStart(2, "0");
    if (showSeconds) {
      const sStr = String(seconds).padStart(2, "0");
      return `${hStr}:${mStr}:${sStr}`;
    }
    return `${hStr}:${mStr}`;
  }, [hours, minutes, seconds, timeFormat, period]);

  const validateTime = useCallback((): boolean => {
    const time = formatTime();
    const timeParts = time.split(":");
    const h = Number(timeParts[0] ?? "0");
    const m = Number(timeParts[1] ?? "0");
    const s = Number(timeParts[2] ?? "0");

    if (disablePast && minTime) {
      const minTimeStr: string = minTime;
      const parts = minTimeStr.split(":");
      const minH = parseInt(parts[0] ?? "0", 10);
      const minM = parseInt(parts[1] ?? "0", 10);
      if (!Number.isNaN(minH) && !Number.isNaN(minM)) {
        const minTotal = minH * 3600 + minM * 60;
        const currentTotal = h * 3600 + m * 60 + (s || 0);
        if (currentTotal < minTotal) {
          setError(`Time cannot be before ${minTimeStr}`);
          return false;
        }
      }
    }

    if (disableFuture && maxTime) {
      const maxTimeStr: string = maxTime;
      const parts = maxTimeStr.split(":");
      const maxH = parseInt(parts[0] ?? "0", 10);
      const maxM = parseInt(parts[1] ?? "0", 10);
      if (!Number.isNaN(maxH) && !Number.isNaN(maxM)) {
        const maxTotal = maxH * 3600 + maxM * 60;
        const currentTotal = h * 3600 + m * 60 + (s || 0);
        if (currentTotal > maxTotal) {
          setError(`Time cannot be after ${maxTimeStr}`);
          return false;
        }
      }
    }

    setError(null);
    return true;
  }, [disablePast, disableFuture, minTime, maxTime, formatTime]);

  const handleConfirm = () => {
    if (validateTime()) {
      onConfirm(formatTime());
    }
  };

  const increment = (setter: (v: number) => void, max: number, current: number) => {
    setter((current + 1) % (max + 1));
  };

  const decrement = (setter: (v: number) => void, max: number, current: number) => {
    setter((current - 1 + max + 1) % (max + 1));
  };

  const maxHour = timeFormat === "12h" ? 12 : 23;
  const minHour = timeFormat === "12h" ? 1 : 0;

  const renderTimeUnit = (
    label: string,
    value: number,
    _min: number,
    _max: number,
    onInc: () => void,
    onDec: () => void,
    disabled = false
  ) => (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-10 rounded-lg"
          onClick={onInc}
          disabled={disabled}
          aria-label={`Increase ${label}`}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <span className="text-3xl font-mono font-bold text-foreground tabular-nums w-14 text-center">
          {String(value).padStart(2, "0")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-10 rounded-lg"
          onClick={onDec}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const dialogContent = (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      size="sm"
    >
      <DialogContent className="p-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && (
          <p className="px-6 pb-2 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-center gap-4">
            {renderTimeUnit("Hour", hours, minHour, maxHour, () => increment(setHours, maxHour, hours), () => decrement(setHours, maxHour, hours))}
            <span className="text-3xl font-mono font-bold text-foreground">:</span>
            {renderTimeUnit("Minute", minutes, 0, 59, () => increment(setMinutes, 59, minutes), () => decrement(setMinutes, 59, minutes))}
            {showSeconds && (
              <React.Fragment>
                <span className="text-3xl font-mono font-bold text-foreground">:</span>
                {renderTimeUnit("Second", seconds, 0, 59, () => increment(setSeconds, 59, seconds), () => decrement(setSeconds, 59, seconds))}
              </React.Fragment>
            )}
            {timeFormat === "12h" && (
              <div className="flex flex-col items-center gap-2 ml-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Period</span>
                <div className="flex gap-1">
                  <Button
                    variant={period === "AM" ? "default" : "outline"}
                    size="sm"
                    className="w-20"
                    onClick={() => setPeriod("AM")}
                  >
                    AM
                  </Button>
                  <Button
                    variant={period === "PM" ? "default" : "outline"}
                    size="sm"
                    className="w-20"
                    onClick={() => setPeriod("PM")}
                  >
                    PM
                  </Button>
                </div>
              </div>
            )}
          </div>
          {error && (
            <p className="mt-3 text-center text-sm text-destructive" role="alert">{error}</p>
          )}
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Selected: <strong className="text-foreground">{formatTime()}</strong></span>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} isLoading={isLoading} disabled={isLoading}>
            <Check className="mr-2 h-4 w-4" />
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Portal to body to avoid GlassPanel containing block issues
  if (typeof document !== "undefined") {
    return createPortal(dialogContent, document.body);
  }
  return null;
}

export default TimePickerModal;