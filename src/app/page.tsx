'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { auth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const loginSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(1, { message: "Password wajib diisi" }),
});

const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Masukkan alamat email yang valid." }),
});

export default function LoginPage() {
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const { user, isUserLoading, userError } = useUser();

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router, isMounted]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const resetForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  });

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsLoginLoading(true);
    if (!auth) {
      toast({ variant: "destructive", title: "Layanan Belum Siap", description: "Layanan otentikasi belum siap." });
      setIsLoginLoading(false);
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      // On success, we don't set loading to false. The useEffect hook will redirect
      // to the dashboard, and this component will unmount.
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login Gagal", description: "Email atau password salah." });
      // On error, we set loading to false so the user can try again.
      setIsLoginLoading(false);
    }
  };

  const handlePasswordReset = async (values: z.infer<typeof resetPasswordSchema>) => {
    setIsResetLoading(true);
    if (!auth) {
      toast({ variant: "destructive", title: "Layanan Belum Siap", description: "Layanan otentikasi belum siap." });
      setIsResetLoading(false);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, values.email);
      toast({ title: "Link Reset Terkirim", description: `Periksa email ${values.email} untuk instruksi.` });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal mengirim email reset. Pastikan email benar." });
    } finally {
      setIsResetLoading(false);
    }
  };

  const showAuthSpinner =
    !isMounted || (isUserLoading && !userError) || (isMounted && !!user);

  if (showAuthSpinner) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <Card className="w-full max-w-md bg-card">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <Image
                src={appLogo?.imageUrl || "/logofix.png"}
                alt="Logo SMPN 5 Langke Rembong"
                width={80}
                height={80}
                priority
              />
            </div>
            <CardTitle className="text-3xl font-bold tracking-wider">E-SPENLI</CardTitle>
            <CardDescription>Absensi Online SMPN 5 Langke Rembong</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <Label>Email</Label>
                      <FormControl>
                        <Input placeholder="Masukkan alamat email Anda" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <DialogTrigger asChild>
                      <button type="button" className="text-xs font-medium text-primary hover:underline">
                        Lupa password?
                      </button>
                    </DialogTrigger>
                  </div>
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="relative">
                          <FormControl>
                            <Input type={showLoginPass ? 'text' : 'password'} placeholder="Masukkan password" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground"
                            onClick={() => setShowLoginPass(!showLoginPass)}
                          >
                            {showLoginPass ? <EyeOff /> : <Eye />}
                            <span className="sr-only">Tampilkan password</span>
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoginLoading}>
                  {isLoginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <span>Login</span>
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex-col items-center justify-center text-sm pt-4">
            <p className="text-center text-sm text-muted-foreground">
              Untuk pembuatan akun, silakan hubungi admin.
            </p>
          </CardFooter>
        </Card>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Masukkan alamat email akun Anda. Kami akan mengirimkan link untuk mengatur ulang password Anda.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(handlePasswordReset)}>
              <div className="py-4">
                <FormField
                  control={resetForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="reset-email">Email</Label>
                      <FormControl>
                        <Input id="reset-email" placeholder="email@anda.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isResetLoading}>
                  <span className="flex items-center justify-center">
                    {isResetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Kirim Link Reset
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        ©2026 SMPN5LR <br /> created by team operator
      </footer>
    </div>
  );
}
