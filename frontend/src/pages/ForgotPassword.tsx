import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'
import { brand } from '@brand/brand'
import { useRequestPasswordReset } from '@/api/auth'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const requestReset = useRequestPasswordReset()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    requestReset.mutate(email, {
      onSuccess: () => setSubmitted(true),
    })
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We've sent password reset instructions to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              If you don't see the email, check your spam folder. The link will expire in 24 hours.
            </p>
            <p className="text-xs text-muted-foreground text-center bg-muted p-3 rounded-md">
              <strong>Dev mode:</strong> Check your Django terminal for the reset link.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false)
                  requestReset.reset()
                }}
              >
                Try a different email
              </Button>
              <Link to="/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
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
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {requestReset.isError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {(requestReset.error as Error)?.message || 'Something went wrong. Please try again.'}
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
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={requestReset.isPending}>
              {requestReset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
