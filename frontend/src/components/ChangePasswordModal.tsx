import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button, Modal } from '@/components/ui'
import { api } from '@/lib/api'

const schema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  next: z.string().min(10, 'At least 10 characters').max(200).refine((p) => !/^[A-Za-z]+$/.test(p) && !/^\d+$/.test(p), 'Mix letters and digits'),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
  .refine((v) => v.next !== v.current, { message: 'Choose a password different from the current one', path: ['next'] })
type Form = z.infer<typeof schema>

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  const close = () => { reset(); setError(''); onClose() }
  const submit = handleSubmit(async (f) => {
    setError('')
    try {
      const r = await api.post<{ message: string }>('/auth/change-password', { current_password: f.current, new_password: f.next })
      toast.success(r.message)
      close()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the password') }
  })
  const field = (id: keyof Form, label: string, auto: string) => (
    <div>
      <label className="label" htmlFor={`cp-${id}`}>{label}</label>
      <input id={`cp-${id}`} type="password" className="input" autoComplete={auto} {...register(id)} />
      {errors[id] && <p className="mt-1 text-xs text-[#ff8796]">{errors[id]?.message}</p>}
    </div>
  )
  return (
    <Modal open={open} onClose={close} title="Change password"
      footer={<><Button onClick={close}>Cancel</Button><Button variant="red" loading={isSubmitting} onClick={submit}>Change password</Button></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {field('current', 'Current password', 'current-password')}
        {field('next', 'New password', 'new-password')}
        {field('confirm', 'Confirm new password', 'new-password')}
        <p className="text-xs text-ink-muted">At least 10 characters, mixing letters and digits. Your other devices will be signed out.</p>
        {error && <p role="alert" className="text-sm text-[#ff8796]">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
