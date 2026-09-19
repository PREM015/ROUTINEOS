"use client";
/**
 * Form — controlled form via a lightweight React context.
 *
 * Holds form values in state (seeded from `initialValues`), exposes a
 * `setFieldValue` updater and the current `values`/`submitting` flag through
 * `useFormContext()`. `<FieldArray>` reads/writes array values through this
 * context; custom fields can too. `initialValues` is only used on mount.
 *
 * Props:
 * - initialValues: seed object (optional)
 * - onSubmit: called with the current values on submit (sync or async)
 * - onValuesChange: notified after every field update
 * - className and standard form props (except onSubmit)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

export interface FormContextValue<T extends Record<string, unknown>> {
  values: T;
  /** Update a single field by name. */
  setFieldValue: (name: string, value: unknown) => void;
  submitting: boolean;
}

const FormContext = createContext<FormContextValue<Record<string, unknown>> | null>(null);

/**
 * Access the nearest `<Form>` context. Throws when used outside a `<Form>`.
 * Requires a type argument matching the form's values type.
 */
export function useFormContext<T extends Record<string, unknown>>(): FormContextValue<T> {
  const context = useContext(FormContext);
  if (context === null) {
    throw new Error('useFormContext must be used within a <Form>');
  }
  return context as FormContextValue<T>;
}

export interface FormProps<T extends Record<string, unknown>>
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  initialValues?: T;
  onSubmit: (values: T) => void | Promise<void>;
  onValuesChange?: (values: T) => void;
}

export function Form<T extends Record<string, unknown>>({
  initialValues,
  onSubmit,
  onValuesChange,
  className,
  children,
  ...props
}: FormProps<T>) {
  const [values, setValues] = useState<T>(() => (initialValues ?? {}) as T);
  const [submitting, setSubmitting] = useState(false);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);

  const setFieldValue = useCallback((name: string, value: unknown) => {
    const next = { ...valuesRef.current, [name]: value } as T;
    valuesRef.current = next;
    setValues(next);
    onValuesChangeRef.current?.(next);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  const contextValue = useMemo<FormContextValue<T>>(
    () => ({ values, setFieldValue, submitting }),
    [values, setFieldValue, submitting],
  );

  return (
    <FormContext.Provider value={contextValue}>
      <form className={cn('space-y-6', className)} onSubmit={handleSubmit} noValidate {...props}>
        {children}
      </form>
    </FormContext.Provider>
  );
}

export default Form;