'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { AnimatedGradientText } from '@/components/ui/aceternity/animated-gradient-text';
import { BackgroundBeams } from '@/components/ui/aceternity/background-beams';
import { apiLogin } from '@/lib/api';
import { saveToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = await apiLogin(email, password);
      saveToken(token);
      router.replace('/conversations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <BackgroundBeams />
      <Card className="relative z-10 w-full max-w-sm border-zinc-700 bg-zinc-900/80 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <h1 className="text-2xl font-bold">
            <AnimatedGradientText>BOT GPT</AnimatedGradientText>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            No account?{' '}
            <Link
              href="/register"
              className="text-primary font-medium hover:underline"
            >
              Create one
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
