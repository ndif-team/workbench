"use client";

import { createClient } from '@/lib/supabase/client'
import { redirect } from 'next/navigation'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { useRef, useState, type ElementRef } from 'react'
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { HatGlasses } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function LoginPage() {

  const [showCaptcha, setShowCaptcha] = useState(false)
  const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null)

  if (process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true') {
    redirect('/workbench')
  }

  const handleGitHubLogin = async () => {
    const supabase = createClient()
    const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/auth/callback`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl
      }
    })
    
    if (error) {
      console.error('OAuth error:', error)
    } else {
      console.log('OAuth initiated, redirect URL:', data?.url)
    }
  }

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/auth/callback`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    })
    
    if (error) {
      console.error('OAuth error:', error)
    } else {
      console.log('OAuth initiated, redirect URL:', data?.url)
    }
  }
  
  const handleLogout = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Logout error:', error)
    } else {
      console.log('Logged out successfully')
    }
  }

  const handleShowCaptcha = () => {
    setShowCaptcha(true)
  }

  const handleCaptchaVerify = async (token: string) => {
    const supabase = createClient()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.auth as any).signInAnonymously({
        options: { captchaToken: token }
      })
      if (error) {
        console.error('Anonymous sign-in error:', error)
        setShowCaptcha(false)
        captchaRef.current?.resetCaptcha()
      } else {
        window.location.href = '/workbench'
      }
    } catch (err) {
      console.error('Anonymous sign-in error:', err)
      setShowCaptcha(false)
      captchaRef.current?.resetCaptcha()
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-tr from-background to-primary/10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to continue</CardTitle>
            <CardDescription>
              Choose how you'd like to access the workbench
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <Button
                onClick={handleGitHubLogin}
                className="w-full"
                variant="outline"
              >
                <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" fill="currentColor" />
                </svg>
                Sign in with GitHub
              </Button>

              <Button
                onClick={handleGoogleLogin}
                className="w-full"
                variant="outline"
                disabled
              >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                Sign in with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-muted px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

  
              <div className="space-y-3">
                {!showCaptcha ? (
                  <Button
                    onClick={handleShowCaptcha}
                    className="w-full"
                    variant="outline"
                  >
                    <HatGlasses
                      className="mr-1 h-4 w-4"
                    />
                    Continue as Guest
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <HCaptcha
                      ref={captchaRef}
                      sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY as string}
                      onVerify={handleCaptchaVerify}
                    />
                    <Button
                      onClick={() => {
                        setShowCaptcha(false)
                        captchaRef.current?.resetCaptcha()
                      }}
                      variant="destructive"
                      size="sm"
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {/* {process.env.NODE_ENV === 'development' && (
              <div className="mt-6 pt-4 border-t">
                <Button
                  onClick={handleLogout}
                  variant="destructive"
                  size="sm"
                  className="w-full"
                >
                  Logout (Debug)
                </Button>
              </div>
            )} */}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}