import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { brand } from '@brand/brand'
import { useConfirmPasswordReset } from '@/api/auth'

export function ResetPassword() {
  const { uid, token } = useParams<{ uid: string; token: string }>()
  const navigate = useNavigate()
  const [password1, setPassword1] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const confirmReset = useConfirmPasswordReset()

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

    if (!uid || !token) {
      setError('Invalid reset link')
      return
    }

    confirmReset.mutate(
      { uid, token, newPassword1: password1, newPassword2: password2 },
      {
        onError: (err) => {
          const apiError = err as { data?: Record<string, string[]> }
          if (apiError.data && typeof apiError.data === 'object') {
            const messages = Object.entries(apiError.data)
              .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
              .join('; ')
            setError(messages || 'Failed to reset password')
          } else {
            setError((err as Error)?.message || 'Failed to reset password')
          }
        },
      }
    )
  }

  // Invalid link (missing params)
  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="mt-4 text-xl font-semibold">Invalid Reset Link</h2>
              <p className="mt-2 text-muted-foreground">
                This password reset link is invalid or malformed.
              </p>
              <Link
                to="/forgot-password"
                className="mt-4 inline-block text-primary hover:underline"
              >
                Request a new reset link
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (confirmReset.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <CardTitle>Password reset successful</CardTitle>
            <CardDescription>
              Your password has been changed. You can now sign in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')} className="w-full">
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2.5 text-foreground">
              <img src={brand.symbol} alt={brand.orgName || brand.productName} className="h-9 w-auto" />
              <span className={`${brand.wordmarkClass} text-3xl`}>{brand.productName}</span>
            </div>
          </div>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || confirmReset.isError) && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error || 'This reset link is invalid or has expired. Please request a new one.'}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password1">New Password</Label>
              <Input
                id="password1"
                type="password"
                placeholder="Enter new password"
                value={password1}
                onChange={(e) => setPassword1(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password2">Confirm New Password</Label>
              <Input
                id="password2"
                type="password"
                placeholder="Confirm new password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={confirmReset.isPending}>
              {confirmReset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset password
            </Button>
          </form>

          {confirmReset.isError && (
            <div className="mt-4 text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Request a new reset link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
