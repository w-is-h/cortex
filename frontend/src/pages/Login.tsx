import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { Logo } from '../components/Shell'
import { inputCls } from '../components/ui'

export function Login() {
  const login = useLogin()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')

  return (
    <div
      className="min-h-screen grid place-items-center"
      style={{
        background:
          'radial-gradient(700px 340px at 50% 18%, color-mix(in oklab, var(--color-brand) 7%, transparent), transparent), var(--background)',
      }}
    >
      <div className="w-full max-w-xs -mt-24">
        <div className="flex items-center gap-3 mb-8 justify-center select-none">
          <Logo size={30} />
          <span className="text-2xl font-semibold tracking-tight">cortex</span>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setError('')
            try {
              await login.mutateAsync(username.trim())
              navigate('/')
            } catch {
              setError('No such user — ask an admin to add you.')
            }
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            className={`${inputCls} h-10 text-center bg-panel`}
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            type="submit"
            disabled={!username.trim() || login.isPending}
            className="w-full h-11 bg-brand text-brand-ink font-semibold text-sm rounded-lg hover:bg-brand/90 hover:shadow-xl hover:shadow-brand/20 hover:-translate-y-px active:translate-y-0 transition-all duration-150 disabled:opacity-40 disabled:hover:translate-y-0 shadow-lg shadow-brand/10"
          >
            Sign in
          </button>
          {error && <p className="text-sm text-danger text-center">{error}</p>}
        </form>
      </div>
    </div>
  )
}
