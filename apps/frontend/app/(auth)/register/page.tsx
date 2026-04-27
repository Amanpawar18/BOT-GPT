'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRegister } from '@/lib/api';
import { saveToken } from '@/lib/auth';

export default function RegisterPage() {
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
      const token = await apiRegister(email, password);
      saveToken(token);
      router.replace('/conversations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel — hidden on small screens */}
      <div className="hidden md:flex w-[420px] shrink-0 bg-[#0f0f11] border-r border-border flex-col justify-center px-12 gap-8">
        <div>
          <div className="w-9 h-9 bg-primary rounded-lg mb-4" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">BOT GPT</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Conversational AI with open chat and document-grounded RAG mode.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <span className="text-zinc-600 mt-0.5">—</span>
            Open chat on any topic
          </li>
          <li className="flex items-start gap-3">
            <span className="text-zinc-600 mt-0.5">—</span>
            Upload PDFs and ask questions about them
          </li>
          <li className="flex items-start gap-3">
            <span className="text-zinc-600 mt-0.5">—</span>
            Context-aware memory with sliding window or summarization
          </li>
        </ul>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create an account</h2>
            <p className="text-sm text-muted-foreground mt-1">Get started for free</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 8 chars)"
                className="bg-card border-border"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
