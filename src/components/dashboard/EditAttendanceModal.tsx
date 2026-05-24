'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface EditAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (action: 'present' | 'leave' | 'sick', reason?: string) => void;
  date: Date | null;
  isSaving: boolean;
}

export default function EditAttendanceModal({
  isOpen,
  onClose,
  onSave,
  date,
  isSaving,
}: EditAttendanceModalProps) {
  const [action, setAction] = useState<'present' | 'leave' | 'sick'>('present');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if ((action === 'leave' || action === 'sick') && !reason.trim()) {
      setError('Keterangan (Izin/Sakit) tidak boleh kosong.');
      return;
    }
    setError(null);
    onSave(action, reason);
  };

  const handleClose = () => {
    // Reset state on close to ensure it's fresh next time.
    setAction('present');
    setReason('');
    setError(null);
    onClose();
  };

  if (!date) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Perbaiki Kehadiran</DialogTitle>
          <DialogDescription>
            Pilih tindakan untuk tanggal {format(date, 'eeee, dd MMMM yyyy', { locale: id })}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <RadioGroup 
            value={action} 
            defaultValue="present" // Fix: Set a default value to prevent uncontrolled -> controlled switch
            onValueChange={(value) => setAction(value as 'present' | 'leave' | 'sick')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="present" id="r1" />
              <Label htmlFor="r1">Jadikan Hadir</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="leave" id="r2" />
              <Label htmlFor="r2">Jadikan Izin</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sick" id="r3" />
              <Label htmlFor="r3">Jadikan Sakit</Label>
            </div>
          </RadioGroup>

          {(action === 'leave' || action === 'sick') && (
            <div className="mt-4">
              <Label htmlFor="reason" className="font-semibold">Keterangan (Izin/Sakit)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Sakit demam, atau mengikuti rapat dinas..."
                className="mt-2"
              />
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
