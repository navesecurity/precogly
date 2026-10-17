import { useState } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import naveSymbol from '@/assets/brand/nave-symbol.svg'
import type { ApiError } from '@/lib/api'

export function Signup() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Check for redirect and pre-filled email from invitation
  const redirectParam = searchParams.get('redirect')
  const invitedEmail = searchParams.get('email')
  const isFromInvitation = redirectParam?.startsWith('/invite/')

  // If coming from invitation, redirect to dashboard (invitation is auto-accepted on signup)
  // Otherwise use the redirect param or default to home
  const from = isFromInvitation ? '/' : (redirectParam || (location.state as { from?: string })?.from || '/')

  const [email, setEmail] = useState(invitedEmail || '')
  const [password1, setPassword1] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password1 !== password2) {
      setError('Passwords do not match')
      return
    }

    if (password1.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      await register({ email, password1, password2 })
      navigate(from, { replace: true })
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.data && typeof apiError.data === 'object') {
        // Parse validation errors from DRF
        const errors = apiError.data as Record<string, string[]>
        const messages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ')
        setError(messages || 'Registration failed')
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Build login URL preserving redirect
  const loginUrl = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2.5 text-foreground">
              <img src={naveSymbol} alt="Nave Security" className="h-9 w-auto" />
              <span className="font-display text-3xl uppercase tracking-[0.14em]">Precogly</span>
            </div>
          </div>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Sign up to start threat modeling</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                readOnly={!!invitedEmail}
                className={invitedEmail ? 'bg-muted' : ''}
              />
              {isFromInvitation && invitedEmail && (
                <p className="text-xs text-muted-foreground">
                  This email matches your team invitation. Use this email to automatically join the team.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password1">Password</Label>
              <div className="relative">
                <Input
                  id="password1"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  value={password1}
                  onChange={(e) => setPassword1(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password2">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="password2"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to={loginUrl} className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
