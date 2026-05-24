'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, User, Briefcase, Loader2, Crown, Search, ShieldCheck, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, setDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, collection, deleteDoc, updateDoc, query, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { getFromCache, setInCache } from '@/lib/cache';
import { PageWrapper } from '@/components/layout/page-wrapper';

type Role = 'guru' | 'pegawai' | 'kepala_sekolah' | 'admin';

type UserData = { id: string; name: string; email: string; role: Role; status: 'Aktif' | 'Non-Aktif'; nip?: string | null; nisn?: string | null; position?: string | null; sequenceNumber?: number | null; skNumber?: string | null; };
type TableProps = { data: UserData[]; canManage: boolean; onEdit: (user: UserData) => void; onToggleStatus: (user: UserData) => void; onDelete: (user: UserData) => void; };

const roleConfig: { [key in Role]: { label: string; placeholder: string; icon: React.ReactNode; title: string; } } = {
  guru: { label: 'NIP', placeholder: 'Masukkan NIP Guru', icon: <User className="h-5 w-5" />, title: 'Guru' },
  pegawai: { label: 'NIP', placeholder: 'Masukkan NIP Pegawai (Opsional)', icon: <Briefcase className="h-5 w-5" />, title: 'Pegawai' },
  kepala_sekolah: { label: 'NIP', placeholder: 'Masukkan NIP Kepala Sekolah', icon: <Crown className="h-5 w-5" />, title: 'Kepala Sekolah' },
  admin: { label: 'Email', placeholder: 'admin.baru@sekolah.sch.id', icon: <ShieldCheck className="h-5 w-5" />, title: 'Admin' }
};

const guruPositions = ["PNS", "PPPK", "PPPK Paruh Waktu (PW)", "Honorer"];
const pegawaiPositions = ["Honorer", "PPPK", "PW", "PNS"];

const sequenceNumberValidation = (data: { role: string; sequenceNumber?: string }) => !((data.role === 'guru' || data.role === 'kepala_sekolah') && data.sequenceNumber) || /^\d+$/.test(data.sequenceNumber);

const addUserSchema = z.object({ name: z.string().min(1, 'Nama lengkap wajib diisi'), email: z.string().email('Alamat email tidak valid.'), role: z.enum(['guru', 'pegawai', 'kepala_sekolah', 'admin'], { required_error: 'Peran wajib dipilih' }), identifier: z.string().optional(), position: z.string().optional(), sequenceNumber: z.string().optional(), skNumber: z.string().optional(), password: z.string().min(6, 'Password minimal harus 6 karakter.'), confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword, { message: 'Konfirmasi password tidak cocok', path: ['confirmPassword'] }).refine(sequenceNumberValidation, { message: 'No. urut harus berupa angka.', path: ['sequenceNumber'] });
const editUserSchema = z.object({ name: z.string().min(1, 'Nama lengkap wajib diisi'), role: z.enum(['guru', 'pegawai', 'kepala_sekolah', 'admin'], { required_error: 'Peran wajib dipilih' }), identifier: z.string().optional(), position: z.string().optional(), sequenceNumber: z.string().optional(), skNumber: z.string().optional() }).refine(sequenceNumberValidation, { message: 'No. urut harus berupa angka.', path: ['sequenceNumber'] });

function useUsersWithCache(firestore: any, isAllowed: boolean) {
    const cacheKey = 'allUsersList_v4';
    const [users, setUsers] = useState<UserData[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !isAllowed) {
            setIsLoading(false);
            return;
        }
        const fetchUsers = async () => {
            setIsLoading(true);
            try {
                const cachedUsers = getFromCache(cacheKey);
                if (cachedUsers) {
                    setUsers(cachedUsers);
                } else {
                    const usersQuery = query(collection(firestore, 'users'));
                    const snapshot = await getDocs(usersQuery);
                    const fetchedUsers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as UserData[];
                    setUsers(fetchedUsers);
                    setInCache(cacheKey, fetchedUsers);
                }
            } catch (error) {
                console.error("Error fetching users with cache:", error);
                setUsers([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUsers();
    }, [firestore, isAllowed]);

    return { usersData: users || [], isLoading };
}

const TableSkeleton = ({ cols }: { cols: number }) => <div className="border rounded-md overflow-x-auto"><Table><TableHeader><TableRow>{[...Array(cols)].map((_, i) => (<TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>))}</TableRow></TableHeader><TableBody>{[...Array(5)].map((_, i) => (<TableRow key={i}>{[...Array(cols)].map((_, j) => (<TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>))}</TableRow>))}</TableBody></Table></div>;

const UserTable = ({ data, canManage, onEdit, onToggleStatus, onDelete }: TableProps) => <Table className="min-w-[1024px]"><TableHeader><TableRow><TableHead className="w-[120px] text-center whitespace-nowrap">Nomor Urut</TableHead><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead>NIP</TableHead><TableHead className="whitespace-nowrap">Status Kepegawaian</TableHead><TableHead className="text-center">Status Akun</TableHead>{canManage && <TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead>}</TableRow></TableHeader><TableBody>{data.length > 0 ? data.map((user) => (<TableRow key={user.id}><TableCell className="text-center font-medium">{(user.role === 'pegawai' ? user.skNumber : user.sequenceNumber) ?? '-'}</TableCell><TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell><TableCell>{user.email || '-'}</TableCell><TableCell><Badge variant="secondary">{roleConfig[user.role]?.title || user.role}</Badge></TableCell><TableCell>{user.nip || '-'}</TableCell><TableCell>{user.position || '-'}</TableCell><TableCell className="text-center"><Badge variant={user.status === 'Aktif' ? 'default' : 'destructive'}>{user.status}</Badge></TableCell>{canManage && <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button aria-haspopup="true" size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Aksi</DropdownMenuLabel><DropdownMenuItem onClick={() => onEdit(user)}>Edit Pengguna</DropdownMenuItem><DropdownMenuItem onClick={() => onToggleStatus(user)}>{user.status === 'Aktif' ? 'Non-aktifkan' : 'Aktifkan'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => onDelete(user)}>Hapus Pengguna</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>}</TableRow>)) : <TableRow><TableCell colSpan={canManage ? 8 : 7} className="h-24 text-center">Tidak ada data pengguna.</TableCell></TableRow>}</TableBody></Table>;
const AdminTable = ({ data, canManage, onEdit, onToggleStatus, onDelete }: TableProps) => <Table><TableHeader><TableRow><TableHead className="w-[50px] text-center">No.</TableHead><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead className="text-center">Status Akun</TableHead>{canManage && <TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead>}</TableRow></TableHeader><TableBody>{data.length > 0 ? data.map((user, index) => (<TableRow key={user.id}><TableCell className="text-center font-medium">{index + 1}</TableCell><TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell><TableCell>{user.email || '-'}</TableCell><TableCell className="text-center"><Badge variant={user.status === 'Aktif' ? 'default' : 'destructive'}>{user.status}</Badge></TableCell>{canManage && <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button aria-haspopup="true" size="icon" variant="ghost" disabled={user.email === 'admin@sekolah.sch.id'}><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Aksi</DropdownMenuLabel><DropdownMenuItem onClick={() => onEdit(user)}>Edit Pengguna</DropdownMenuItem><DropdownMenuItem onClick={() => onToggleStatus(user)} disabled={user.email === 'admin@sekolah.sch.id'}>{user.status === 'Aktif' ? 'Non-aktifkan' : 'Aktifkan'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => onDelete(user)} disabled={user.email === 'admin@sekolah.sch.id'}>Hapus Pengguna</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>}</TableRow>)) : <TableRow><TableCell colSpan={canManage ? 5 : 4} className="h-24 text-center">Tidak ada data admin.</TableCell></TableRow>}</TableBody></Table>;

function UsersView({ isAllowed, canManage, isPermissionsLoading }: { isAllowed: boolean, canManage: boolean, isPermissionsLoading: boolean }) {
    type UserFilter = 'all' | 'guru' | 'pegawai' | 'kepala_sekolah';

    const [userFilter, setUserFilter] = useState<UserFilter>('all');
    const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
    const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const [adminSearch, setAdminSearch] = useState('');
    const [headmasterExists, setHeadmasterExists] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const { usersData, isLoading: isUsersLoading } = useUsersWithCache(firestore, isAllowed);
    const showSkeleton = isPermissionsLoading || isUsersLoading;

    useEffect(() => {
        if (usersData) setHeadmasterExists(usersData.some(u => u.role === 'kepala_sekolah'));
    }, [usersData]);

    const { mainUsers, adminData } = useMemo(() => {
        if (!usersData) return { mainUsers: [], adminData: [] };
        const sortedUsers = [...usersData].sort((a, b) => {
            const getSortValue = (user: UserData) => (user.role === 'pegawai' ? user.skNumber : user.sequenceNumber) ?? null;
            const valA = getSortValue(a), valB = getSortValue(b);
            if (valA != null && valB == null) return -1;
            if (valA == null && valB != null) return 1;
            if (valA != null && valB != null) return String(valA).localeCompare(String(valB), undefined, { numeric: true });
            return a.name.localeCompare(b.name);
        });
        return { mainUsers: sortedUsers.filter(u => u.role !== 'admin'), adminData: sortedUsers.filter(u => u.role === 'admin') };
    }, [usersData]);

    const filteredUserData = useMemo(() => mainUsers.filter(u => (userFilter === 'all' || u.role === userFilter) && u.name.toLowerCase().includes(userSearch.toLowerCase())), [mainUsers, userFilter, userSearch]);
    const filteredAdminData = useMemo(() => adminData.filter(u => u.name.toLowerCase().includes(adminSearch.toLowerCase())), [adminData, adminSearch]);

    const addForm = useForm<z.infer<typeof addUserSchema>>({ resolver: zodResolver(addUserSchema), defaultValues: { role: 'guru', name: '', email: '', password: '', confirmPassword: '' } });
    const editForm = useForm<z.infer<typeof editUserSchema>>({ resolver: zodResolver(editUserSchema), defaultValues: { role: 'guru', name: '' } });

    const selectedRoleForAdd = addForm.watch('role');
    const selectedRoleForEdit = editForm.watch('role');

    const isSequenceNumberTaken = (sequenceNumber: string, currentUserId?: string | null) => usersData.some(u => (u.role === 'guru' || u.role === 'kepala_sekolah') && u.id !== currentUserId && String(u.sequenceNumber) === sequenceNumber);
    const isSkNumberTaken = (skNumber: string, currentUserId?: string | null) => usersData.some(u => u.role === 'pegawai' && u.id !== currentUserId && u.skNumber === skNumber);

    async function handleCreateUser(values: z.infer<typeof addUserSchema>) {
        if (!firestore) return toast({ variant: 'destructive', title: 'Error', description: 'DB service unavailable.' });
        if (values.role === 'kepala_sekolah' && headmasterExists) return toast({ variant: 'destructive', title: 'Gagal', description: 'Posisi Kepala Sekolah sudah terisi.' });
        if ((values.role === 'guru' || values.role === 'kepala_sekolah') && values.sequenceNumber && isSequenceNumberTaken(values.sequenceNumber)) return toast({ variant: 'destructive', title: 'Nomor Urut Terpakai', description: 'Nomor Urut ini sudah digunakan.' });
        if (values.role === 'pegawai' && values.skNumber && isSkNumberTaken(values.skNumber)) return toast({ variant: 'destructive', title: 'Nomor SK Terpakai', description: 'Nomor SK ini sudah digunakan.' });

        setIsSaving(true);
        const tempApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
        const tempAuth = getAuth(tempApp);

        try {
            const { user: newUser } = await createUserWithEmailAndPassword(tempAuth, values.email, values.password);
            if (values.email !== 'admin@sekolah.sch.id') await sendEmailVerification(newUser);
            
            const userDoc: any = { name: values.name, role: values.role, email: values.email, status: 'Aktif', nip: null, position: null, sequenceNumber: null, skNumber: null };
            if (values.role === 'guru' || values.role === 'kepala_sekolah') {
                userDoc.nip = values.identifier?.trim() || null;
                userDoc.position = values.position || null;
                userDoc.sequenceNumber = values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null;
            } else if (values.role === 'pegawai') {
                userDoc.nip = values.identifier?.trim() || null;
                userDoc.position = values.position || null;
                userDoc.skNumber = values.skNumber?.trim() || null;
            }

            await setDocumentNonBlocking(doc(firestore, "users", newUser.uid), userDoc, {});
            toast({ title: 'Pengguna Ditambahkan', description: `Akun untuk ${values.name} telah dibuat.` });
            addForm.reset();
            setIsAddUserDialogOpen(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Pendaftaran Gagal', description: error.code === 'auth/email-already-in-use' ? 'Email ini sudah terdaftar.' : 'Gagal membuat akun.' });
        } finally {
            setIsSaving(false);
            await deleteApp(tempApp);
        }
    }

    const openEditDialog = (user: UserData) => {
        setSelectedUser(user);
        editForm.reset({ name: user.name, role: user.role, identifier: user.nip || '', position: user.position || '', sequenceNumber: user.sequenceNumber?.toString() || '', skNumber: user.skNumber || '' });
        setIsEditUserDialogOpen(true);
    };

    async function handleUpdateUser(values: z.infer<typeof editUserSchema>) {
        if (!selectedUser || !firestore) return;
        if (values.role === 'kepala_sekolah' && headmasterExists && selectedUser.role !== 'kepala_sekolah') return toast({ variant: 'destructive', title: 'Gagal', description: 'Posisi Kepala Sekolah sudah terisi.' });
        if ((values.role === 'guru' || values.role === 'kepala_sekolah') && values.sequenceNumber && isSequenceNumberTaken(values.sequenceNumber, selectedUser.id)) return toast({ variant: 'destructive', title: 'Nomor Urut Terpakai', description: 'Nomor Urut ini sudah digunakan.' });
        if (values.role === 'pegawai' && values.skNumber && isSkNumberTaken(values.skNumber, selectedUser.id)) return toast({ variant: 'destructive', title: 'Nomor SK Terpakai', description: 'Nomor SK ini sudah digunakan.' });

        setIsSaving(true);
        const dataToUpdate: any = { name: values.name, role: values.role, nip: null, position: null, sequenceNumber: null, skNumber: null };
        if (values.role === 'guru' || values.role === 'kepala_sekolah') {
            dataToUpdate.nip = values.identifier?.trim() || null;
            dataToUpdate.position = values.position || null;
            dataToUpdate.sequenceNumber = values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null;
        } else if (values.role === 'pegawai') {
            dataToUpdate.nip = values.identifier?.trim() || null;
            dataToUpdate.position = values.position || null;
            dataToUpdate.skNumber = values.skNumber?.trim() || null;
        }
        try {
            await updateDoc(doc(firestore, 'users', selectedUser.id), dataToUpdate);
            toast({ title: 'Perubahan Disimpan', description: `Data untuk ${values.name} telah diperbarui.` });
            setIsEditUserDialogOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: 'Terjadi kesalahan.' });
        } finally {
            setIsSaving(false);
            setSelectedUser(null);
        }
    }

    const handleToggleStatus = async (user: UserData) => {
        if (!firestore) return;
        if (user.email === 'admin@sekolah.sch.id') return toast({ variant: 'destructive', title: 'Aksi Ditolak', description: 'Akun admin utama tidak dapat diubah.' });
        const newStatus = user.status === 'Aktif' ? 'Non-Aktif' : 'Aktif';
        try {
            await updateDoc(doc(firestore, 'users', user.id), { status: newStatus });
            toast({ title: `Status Diperbarui`, description: `Status ${user.name} sekarang ${newStatus}.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Memperbarui Status', description: 'Terjadi kesalahan.' });
        }
    };

    const openDeleteDialog = (user: UserData) => { setUserToDelete(user); setIsDeleteDialogOpen(true); };
    const handleDialogStateChange = (open: boolean) => { if (!open) { setIsDeleting(false); setUserToDelete(null); } setIsDeleteDialogOpen(open); };

    async function handleDeleteUser() {
        if (!userToDelete || !firestore) return;
        if (userToDelete.email === 'admin@sekolah.sch.id') return toast({ variant: 'destructive', title: 'Aksi Ditolak', description: 'Akun admin utama tidak dapat dihapus.' });
        setIsDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'users', userToDelete.id));
            toast({ title: 'Pengguna Dihapus', description: `Profil untuk ${userToDelete.name} telah dihapus.` });
            setIsDeleteDialogOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menghapus', description: 'Terjadi kesalahan.' });
        } finally { setIsDeleting(false); }
    }

    return (
        <div className="space-y-8">
            <section>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Manajemen Pengguna</h2>
                        <p className="text-muted-foreground">Kelola data Guru, Pegawai, dan Kepala Sekolah.</p>
                    </div>
                    {canManage && (
                        <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                            <DialogTrigger asChild><Button><PlusCircle className="mr-2 h-4 w-4" />Tambah Pengguna</Button></DialogTrigger>
                            <DialogContent className="sm:max-w-[480px]" aria-describedby="add-user-dialog-description">
                                <DialogHeader>
                                    <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                                    <DialogDescription id="add-user-dialog-description">Isi detail di bawah untuk membuat akun baru.</DialogDescription>
                                </DialogHeader>
                                <Form {...addForm}>
                                    <form onSubmit={addForm.handleSubmit(handleCreateUser)} className="space-y-4">
                                        <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                                            <FormField control={addForm.control} name="role" render={({ field }) => (<FormItem><FormLabel>Peran Pengguna</FormLabel><FormControl><RadioGroup onValueChange={(value) => { field.onChange(value); addForm.setValue('position', ''); }} value={field.value} defaultValue="guru" className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Object.entries(roleConfig).map(([role, config]) => { const isDisabled = role === 'kepala_sekolah' && headmasterExists; const radioItem = <FormItem key={role}><FormControl><RadioGroupItem value={role} id={`add-${role}`} className="sr-only" disabled={isDisabled} /></FormControl><Label htmlFor={`add-${role}`} className={cn('flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 text-center hover:bg-accent hover:text-accent-foreground cursor-pointer', { 'border-primary': selectedRoleForAdd === role, 'cursor-not-allowed opacity-50': isDisabled })}>{config.icon}<span className="mt-1.5 text-xs">{config.title}</span></Label></FormItem>; if (isDisabled) return <TooltipProvider key={role} delayDuration={100}><Tooltip><TooltipTrigger asChild><div className="w-full h-full">{radioItem}</div></TooltipTrigger><TooltipContent><p>Posisi Kepala Sekolah sudah terisi.</p></TooltipContent></Tooltip></TooltipProvider>; return radioItem;})}</RadioGroup></FormControl></FormItem>)} />
                                            <FormField control={addForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Nama lengkap dengan gelar..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                            <FormField control={addForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email.aktif@contoh.com" {...field} /></FormControl><FormDescription className="text-xs">Pengguna akan menerima email verifikasi.</FormDescription><FormMessage /></FormItem>)}/>
                                            {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah') && <FormField control={addForm.control} name="sequenceNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Urut</FormLabel><FormControl><Input placeholder="Nomor untuk pengurutan daftar" {...field} /></FormControl><FormDescription className="text-xs">Sesuai nomor urut pada SK.</FormDescription><FormMessage /></FormItem>)}/>}                                                
                                            {selectedRoleForAdd === 'pegawai' && <FormField control={addForm.control} name="skNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Urut (dari SK)</FormLabel><FormControl><Input placeholder="Masukkan nomor urut dari SK" {...field} /></FormControl><FormMessage /></FormItem>)}/>}
                                            {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah' || selectedRoleForAdd === 'pegawai') && <FormField control={addForm.control} name="identifier" render={({ field }) => (<FormItem><FormLabel>{roleConfig[selectedRoleForAdd as Role]?.label} <span className="text-muted-foreground">(Opsional)</span></FormLabel><FormControl><Input placeholder={roleConfig[selectedRoleForAdd as Role]?.placeholder} {...field} /></FormControl><FormMessage /></FormItem>)} />}
                                            {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah' || selectedRoleForAdd === 'pegawai') && <FormField control={addForm.control} name="position" render={({ field }) => (<FormItem><FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih status..." /></SelectTrigger></FormControl><SelectContent>{(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah') ? guruPositions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>) : pegawaiPositions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />}
                                            <FormField control={addForm.control} name="password" render={({ field }) => (<FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder="Minimal 6 karakter" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                            <FormField control={addForm.control} name="confirmPassword" render={({ field }) => (<FormItem><FormLabel>Konfirmasi Password</FormLabel><FormControl><Input type="password" placeholder="Ulangi password di atas" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                        </div>
                                        <DialogFooter><Button type="submit" className="w-full" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<span>Buat Akun Pengguna</span></Button></DialogFooter>
                                    </form>
                                </Form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <Select value={userFilter} onValueChange={(value) => setUserFilter(value as UserFilter)}>
                        <SelectTrigger className="w-full sm:w-[240px]"><div className="flex items-center gap-2">{userFilter === 'all' && <Users className="h-4 w-4 text-muted-foreground" />}{userFilter === 'kepala_sekolah' && <Crown className="h-4 w-4 text-muted-foreground" />}{userFilter === 'guru' && <User className="h-4 w-4 text-muted-foreground" />}{userFilter === 'pegawai' && <Briefcase className="h-4 w-4 text-muted-foreground" />}<SelectValue placeholder="Pilih peran..." /></div></SelectTrigger>
                        <SelectContent><SelectItem value="all">Semua Pengguna</SelectItem><SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem><SelectItem value="guru">Guru</SelectItem><SelectItem value="pegawai">Pegawai</SelectItem></SelectContent>
                    </Select>
                    <div className="relative w-full"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="search" placeholder="Cari berdasarkan nama..." className="w-full rounded-lg bg-background pl-8" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} /></div>
                </div>
                <Card className="w-full">
                    <CardContent className="p-0">{showSkeleton ? <TableSkeleton cols={canManage ? 8 : 7} /> : <div className="overflow-x-auto"><UserTable data={filteredUserData} canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} /></div>}</CardContent>
                </Card>
            </section>

            <section>
                <div className="mb-4">
                    <h2 className="text-2xl font-bold tracking-tight">Manajemen Admin</h2>
                    <p className="text-muted-foreground">Kelola pengguna dengan peran admin.</p>
                </div>
                <div className="flex justify-end mb-4"><div className="relative w-full sm:w-[300px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="search" placeholder="Cari nama admin..." className="w-full rounded-lg bg-background pl-8" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} /></div></div>
                <Card className="w-full">
                    <CardContent className="p-0">{showSkeleton ? <TableSkeleton cols={canManage ? 5 : 4} /> : <div className="overflow-x-auto"><AdminTable data={filteredAdminData} canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} /></div>}</CardContent>
                </Card>
            </section>

            <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
                <DialogContent className="sm:max-w-[480px]" aria-describedby="edit-user-dialog-description">
                    <DialogHeader>
                        <DialogTitle>Edit Pengguna</DialogTitle>
                        <DialogDescription id="edit-user-dialog-description">Perbarui detail informasi pengguna. Email tidak dapat diubah.</DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleUpdateUser)} className="space-y-4">
                            <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                                <div className="space-y-2"><Label htmlFor="edit-email">Email</Label><Input id="edit-email" value={selectedUser?.email || ''} readOnly disabled /></div>
                                <FormField control={editForm.control} name="role" render={({ field }) => (<FormItem><FormLabel>Peran Pengguna</FormLabel><FormControl><RadioGroup onValueChange={(value) => { field.onChange(value); editForm.setValue('position', ''); }} value={field.value} defaultValue="guru" className="grid grid-cols-2 sm:grid-cols-4 gap-2" disabled={selectedUser?.email === 'admin@sekolah.sch.id'}>{Object.entries(roleConfig).map(([role, config]) => { const isDisabled = role === 'kepala_sekolah' && headmasterExists && selectedUser?.role !== 'kepala_sekolah'; const radioItem = <FormItem key={role}><FormControl><RadioGroupItem value={role} id={`edit-${role}`} className="sr-only" disabled={isDisabled}/></FormControl><Label htmlFor={`edit-${role}`} className={cn('flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 text-center hover:bg-accent hover:text-accent-foreground cursor-pointer', { 'border-primary': selectedRoleForEdit === role, 'cursor-not-allowed opacity-50': isDisabled })}>{config.icon}<span className="mt-1.5 text-xs">{config.title}</span></Label></FormItem>; if (isDisabled) return <TooltipProvider key={role} delayDuration={100}><Tooltip><TooltipTrigger asChild><div className="w-full h-full">{radioItem}</div></TooltipTrigger><TooltipContent><p>Posisi Kepala Sekolah sudah terisi.</p></TooltipContent></Tooltip></TooltipProvider>; return radioItem;})}</RadioGroup></FormControl>{selectedUser?.email === 'admin@sekolah.sch.id' && <FormDescription className="text-xs">Peran admin utama tidak dapat diubah.</FormDescription>}</FormItem>)}/>
                                <FormField control={editForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap (dengan gelar)</FormLabel><FormControl><Input placeholder="Contoh: Budi Santoso, S.Pd" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah') && <FormField control={editForm.control} name="sequenceNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Urut</FormLabel><FormControl><Input placeholder="Nomor untuk pengurutan daftar" {...field} /></FormControl><FormDescription className="text-xs">Sesuai nomor urut pada SK.</FormDescription><FormMessage /></FormItem>)}/>}
                                {selectedRoleForEdit === 'pegawai' && <FormField control={editForm.control} name="skNumber" render={({ field }) => (<FormItem><FormLabel>Nomor Urut (dari SK)</FormLabel><FormControl><Input placeholder="Masukkan nomor urut dari SK" {...field} /></FormControl><FormMessage /></FormItem>)}/>}
                                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah' || selectedRoleForEdit === 'pegawai') && <FormField control={editForm.control} name="identifier" render={({ field }) => (<FormItem><FormLabel>{roleConfig[selectedRoleForEdit as Role]?.label || "Identifier"}<span className="text-muted-foreground ml-1">(Opsional)</span></FormLabel><FormControl><Input placeholder={roleConfig[selectedRoleForEdit as Role]?.placeholder} {...field} /></FormControl><FormMessage /></FormItem>)}/>}
                                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah' || selectedRoleForEdit === 'pegawai') && <FormField control={editForm.control} name="position" render={({ field }) => (<FormItem><FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel><Select onValueChange={field.onChange} value={field.value || ''}><FormControl><SelectTrigger><SelectValue placeholder="Pilih status..." /></SelectTrigger></FormControl><SelectContent>{(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah') ? guruPositions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>) : pegawaiPositions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />}
                            </div>
                            <DialogFooter><Button type="submit" className="w-full" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<span>Simpan Perubahan</span></Button></DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
            
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDialogStateChange}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Anda yakin ingin menghapus pengguna ini?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data profil pengguna ({userToDelete?.name}) secara permanen. Tindakan ini TIDAK menghapus akun login pengguna, yang harus dihapus manual di Firebase Console.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={handleDeleteUser} className={cn(buttonVariants({ variant: "destructive" }))} disabled={isDeleting}>{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ya, Hapus Profil</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function AdminUsersPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();

    const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

    const isLoadingPage = isUserLoading || isUserDataLoading;
    const canManage = !isLoadingPage && userData?.role === 'admin';
    const canView = !isLoadingPage && (canManage || userData?.role === 'kepala_sekolah');

    useEffect(() => {
        if (!isLoadingPage && !canView) {
            router.replace(user ? '/dashboard' : '/');
        }
    }, [isLoadingPage, canView, router, user]);

    if (isLoadingPage || !canView) {
        // While loading permissions, or if permissions are denied (and we are about to be redirected),
        // render the skeleton view. This provides a consistent UI until the real data is ready or the page changes,
        // preventing any flicker.
        return (
            <PageWrapper>
                <UsersView 
                    isAllowed={false} 
                    canManage={false} 
                    isPermissionsLoading={true} 
                />
            </PageWrapper>
        );
    }

    // Only when permissions are fully loaded and access is granted, render the interactive view.
    return (
        <PageWrapper>
            <UsersView 
                isAllowed={canView} 
                canManage={canManage} 
                isPermissionsLoading={isLoadingPage} // This will be false
            />
        </PageWrapper>
    );
}
