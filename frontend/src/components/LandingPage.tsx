import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import naveSymbol from '@/assets/brand/nave-symbol.svg'

const isGuestOnly = import.meta.env.VITE_GUEST_ONLY === 'true'

export function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src={naveSymbol} alt="Nave Security" className="h-14 w-auto" />
          <h1 className="font-display text-4xl uppercase tracking-[0.14em]">Precogly</h1>
        </div>

        {/* Tagline */}
        <p className="text-lg text-muted-foreground">
          OWASP Precogly is the open-source alternative to commercial threat modeling tools
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full">
          <Link to="/guest" className="w-full">
            <Button size="lg" className="w-full gap-2">
              Start Threat Modeling
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            Try the editor — no sign-up required. Draw DFDs, identify threats, and add countermeasures. Your work saves locally as JSON.
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Want the full platform?</span>{' '}
            Threat libraries, risk management, AI-assisted analysis, compliance tracking, reporting, pentest scoping, and more.{' '}
            <a
              href="https://precogly.github.io/precogly/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Self-host with Docker
            </a>{' '}
            or{' '}
            <a
              href="mailto:vikramsnarayan@gmail.com"
              className="text-primary hover:underline"
            >
              contact the maintainer
            </a>
            .
          </p>

          {!isGuestOnly && (
            <Link to="/login" className="w-full">
              <Button variant="outline" size="lg" className="w-full">
                Sign In
              </Button>
            </Link>
          )}

          {!isGuestOnly && (
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary hover:underline">
                Sign up free
              </Link>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 pt-4 text-sm text-muted-foreground">
          <a
            href="https://precogly.github.io/precogly/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Docs
          </a>
          <span className="text-border">|</span>
          <a
            href="https://github.com/precogly/precogly"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
