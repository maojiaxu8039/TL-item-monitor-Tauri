import { useCallback, useState } from "react"

export type FormErrors<T> = Partial<Record<keyof T, string>>

export interface UseFormOptions<T> {
  initialValues: T
  validate?: (values: T) => FormErrors<T>
  onSubmit: (values: T) => void | Promise<void>
}

export interface UseFormReturn<T> {
  values: T
  errors: FormErrors<T>
  isSubmitting: boolean
  isValid: boolean
  setValue: <K extends keyof T>(field: K, value: T[K]) => void
  setValues: (values: Partial<T>) => void
  setError: <K extends keyof T>(field: K, error: string) => void
  clearError: <K extends keyof T>(field: K) => void
  handleChange: <K extends keyof T>(field: K) => (value: T[K]) => void
  handleSubmit: (e?: React.FormEvent) => Promise<void>
  reset: () => void
  validate: () => boolean
}

export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const { initialValues, validate: validateFn, onSubmit } = options
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors<T>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = useCallback((): boolean => {
    if (!validateFn) return true
    const newErrors = validateFn(values)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [validateFn, values])

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const setValuesPartial = useCallback((partial: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...partial }))
  }, [])

  const setError = useCallback(<K extends keyof T>(field: K, error: string) => {
    setErrors((prev) => ({ ...prev, [field]: error }))
  }, [])

  const clearError = useCallback(<K extends keyof T>(field: K) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const handleChange = useCallback(
    <K extends keyof T>(field: K) => (value: T[K]) => {
      setValue(field, value)
    },
    [setValue],
  )

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault()
      }
      if (!validate()) return
      setIsSubmitting(true)
      try {
        await onSubmit(values)
      } finally {
        setIsSubmitting(false)
      }
    },
    [validate, onSubmit, values],
  )

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
  }, [initialValues])

  const isValid = Object.keys(errors).length === 0

  return {
    values,
    errors,
    isSubmitting,
    isValid,
    setValue,
    setValues: setValuesPartial,
    setError,
    clearError,
    handleChange,
    handleSubmit,
    reset,
    validate,
  }
}
