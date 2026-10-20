import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, User, Settings, LogOut, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { TeamSwitcher } from './TeamSwitcher'
import { brand } from '@brand/brand'

const navItems = [
  { name: 'Dashboard', href: '/' },
  { name: 'Threat Models', href: '/threat-models' },
  { name: 'Libraries', href: '/libraries' },
]

// Routes where we show minimal navbar (just logo + user menu)
const minimalNavRoutes = [
  /^\/threat-models\/[^/]+$/, // /threat-models/:id (but not /threat-models)
  /^\/threat-models\/[^/]+\/diagrams/, // /threat-models/:id/diagrams/:diagramId
]

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Check if we should show minimal nav
  const isMinimalNav = minimalNavRoutes.some((pattern) =>
    pattern.test(location.pathname)
  )

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className={cn('flex items-center px-4', isMinimalNav ? 'h-11' : 'h-14')}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src={brand.symbol}
            alt={brand.orgName || brand.productName}
            className={cn('w-auto', isMinimalNav ? 'h-7' : 'h-9')}
          />
          <span className="flex flex-col leading-none">
            <span className={cn(brand.wordmarkClass, isMinimalNav ? 'text-lg' : 'text-xl')}>
              {brand.productName}
            </span>
            {brand.orgName && (
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {brand.orgName}
              </span>
            )}
          </span>
        </Link>

        {/* Team Switcher - progressive disclosure (hidden if only one team) */}
        {!isMinimalNav && (
          <div className="ml-4">
            <TeamSwitcher />
          </div>
        )}

        {/* Navigation Links - only show in full mode */}
        {!isMinimalNav && (
          <nav className="flex items-center gap-1 ml-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  location.pathname === item.href ||
                    (item.href === '/libraries' && location.pathname.startsWith('/libraries'))
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Quick nav dropdown - only in minimal mode */}
        {isMinimalNav && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
                <LayoutGrid className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {navItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link to={item.href}>{item.name}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn('flex items-center gap-2', isMinimalNav && 'h-8 px-2')}
            >
              <Avatar className={cn(isMinimalNav ? 'h-6 w-6' : 'h-8 w-8')}>
                <AvatarFallback className={cn(isMinimalNav && 'text-xs')}>
                  {user?.email?.substring(0, 2).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              {!isMinimalNav && (
                <>
                  <span className="text-sm font-medium">{user?.email ?? 'User'}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/settings/profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings/organization">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
